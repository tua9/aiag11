import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import mongoose from "mongoose";
import ollama from "ollama";
import opencvModule from "@techstark/opencv-js";
import sharp from "sharp";
import Order from "../models/order.model.js";
import ReturnOrder from "../models/return-order.model.js";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 300;
const MAX_FRAMES_PER_VIDEO = 3;
const FRAME_SIZE = 384;
const FRAME_BYTES = FRAME_SIZE * FRAME_SIZE * 3;
const openCvPromise = opencvModule;

function runCommand(
  command,
  args,
  { timeoutMs = 30_000, maxOutputBytes = 5_000_000 } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let errorBytes = 0;
    let failure = null;
    const timer = setTimeout(() => {
      failure = new Error(`${command} timed out`);
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        failure = new Error(`${command} output exceeded its limit`);
        child.kill("SIGKILL");
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (errorBytes >= 16_000) return;
      const remaining = 16_000 - errorBytes;
      const selected = chunk.subarray(0, remaining);
      stderr.push(selected);
      errorBytes += selected.length;
    });
    child.once("error", (error) => {
      failure = error;
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (code !== 0) {
        return reject(
          new Error(
            `${command} failed: ${Buffer.concat(stderr).toString("utf8")}`,
          ),
        );
      }
      return resolve(Buffer.concat(stdout));
    });
  });
}

async function downloadVideo(url, filePath) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Video URL không hợp lệ.");
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "res.cloudinary.com"
  ) {
    throw new Error("Chỉ hỗ trợ video HTTPS từ res.cloudinary.com.");
  }

  const response = await fetch(parsedUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Không tải được video (HTTP ${response.status}).`);
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > MAX_VIDEO_BYTES) {
    throw new Error("Video vượt quá giới hạn 100 MB.");
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_VIDEO_BYTES) {
        await reader.cancel();
        throw new Error("Video vượt quá giới hạn 100 MB.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0) throw new Error("Video tải về rỗng.");
  await writeFile(filePath, Buffer.concat(chunks, totalBytes), { flag: "wx" });
}

async function getVideoDuration(filePath) {
  const output = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    filePath,
  ]);
  const duration = Number(JSON.parse(output.toString("utf8")).format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Không xác định được thời lượng video.");
  }
  if (duration > MAX_VIDEO_SECONDS) {
    throw new Error("Video vượt quá giới hạn 5 phút.");
  }
  return duration;
}

function sampleTimes(duration) {
  return [
    ...new Set(
      [duration * 0.1, duration * 0.4, duration * 0.75].map((time) =>
        time.toFixed(2),
      ),
    ),
  ]
    .map(Number)
    .slice(0, MAX_FRAMES_PER_VIDEO);
}

async function extractFrame(videoPath, timestampSeconds) {
  const jpeg = await runCommand(
    "ffmpeg",
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      timestampSeconds.toFixed(2),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      `scale=${FRAME_SIZE}:${FRAME_SIZE}:force_original_aspect_ratio=decrease,pad=${FRAME_SIZE}:${FRAME_SIZE}:(ow-iw)/2:(oh-ih)/2`,
      "-q:v",
      "4",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ],
    { timeoutMs: 20_000 },
  );
  if (jpeg.length === 0) throw new Error("FFmpeg không trích xuất được frame.");

  const normalizedJpeg = await sharp(jpeg)
    .rotate()
    .resize(FRAME_SIZE, FRAME_SIZE, {
      fit: "contain",
      background: { r: 16, g: 24, b: 32 },
    })
    .jpeg({ quality: 72 })
    .toBuffer();
  const { data, info } = await sharp(normalizedJpeg)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    info.width !== FRAME_SIZE ||
    info.height !== FRAME_SIZE ||
    data.length !== FRAME_BYTES
  ) {
    throw new Error("Kích thước frame không hợp lệ.");
  }
  return {
    timestampSeconds,
    image: normalizedJpeg,
    pixels: new Uint8Array(data),
  };
}

async function extractVideoFrames(videoPath) {
  const duration = await getVideoDuration(videoPath);
  const frames = [];
  for (const timestampSeconds of sampleTimes(duration)) {
    try {
      frames.push(await extractFrame(videoPath, timestampSeconds));
    } catch {
      // One unavailable timestamp should not discard the other evidence frames.
    }
  }
  return frames;
}

function compareFrameSets(cv, orderFrames, returnFrames) {
  const orderMats = orderFrames.map(({ pixels }) =>
    cv.matFromArray(FRAME_SIZE, FRAME_SIZE, cv.CV_8UC3, pixels),
  );
  const returnMats = returnFrames.map(({ pixels }) =>
    cv.matFromArray(FRAME_SIZE, FRAME_SIZE, cv.CV_8UC3, pixels),
  );
  const differences = [];

  try {
    for (const orderMat of orderMats) {
      for (const returnMat of returnMats) {
        const diff = new cv.Mat();
        try {
          cv.absdiff(orderMat, returnMat, diff);
          const channels = cv.mean(diff);
          differences.push(
            (channels[0] + channels[1] + channels[2]) / (3 * 255),
          );
        } finally {
          diff.delete();
        }
      }
    }
  } finally {
    for (const mat of [...orderMats, ...returnMats]) mat.delete();
  }

  if (!differences.length) return null;
  const best = Math.min(...differences);
  const average =
    differences.reduce((sum, value) => sum + value, 0) / differences.length;
  return {
    framePairCount: differences.length,
    bestFramePixelSimilarity: Number((1 - best).toFixed(3)),
    averageFramePixelSimilarity: Number((1 - average).toFixed(3)),
    note: "Pixel similarity is only supporting evidence; different camera angles can reduce this score.",
  };
}

function reviewResult(explanation, evidence = []) {
  return {
    status: "NEEDS_REVIEW",
    confidence: 0,
    explanation,
    differences: [],
    evidence,
  };
}

function parseModelAnalysis(content, frameCountIsSufficient) {
  let analysis;
  try {
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    analysis = JSON.parse(jsonText);
  } catch {
    return reviewResult(
      "Gemma trả kết quả không phải JSON hợp lệ; cần kiểm tra thủ công.",
    );
  }

  const allowedStatuses = new Set(["MATCH", "MISMATCH", "NEEDS_REVIEW"]);
  const explanation =
    typeof analysis.explanation === "string" && analysis.explanation.trim()
      ? analysis.explanation.trim()
      : "Không có giải thích đủ rõ từ mô hình.";
  const differences = Array.isArray(analysis.differences)
    ? analysis.differences.filter((item) => typeof item === "string")
    : [];
  const confidence = Number.isFinite(Number(analysis.confidence))
    ? Math.max(0, Math.min(1, Number(analysis.confidence)))
    : 0;
  let status = allowedStatuses.has(analysis.status)
    ? analysis.status
    : "NEEDS_REVIEW";

  if (
    (status === "MATCH" &&
      (!frameCountIsSufficient ||
        analysis.visualClarity !== "clear" ||
        confidence < 0.75)) ||
    (status === "MISMATCH" &&
      (analysis.visualClarity !== "clear" ||
        confidence < 0.65 ||
        differences.length === 0))
  ) {
    status = "NEEDS_REVIEW";
  }

  return {
    status,
    confidence,
    explanation:
      status === "NEEDS_REVIEW" && analysis.status !== "NEEDS_REVIEW"
        ? `${explanation} Bằng chứng chưa đủ rõ để kết luận chắc chắn.`
        : explanation,
    differences,
    visualClarity: analysis.visualClarity ?? "unknown",
  };
}

async function analyzeFrames({
  order,
  returnOrder,
  orderFrames,
  returnFrames,
  visualMetrics,
}) {
  const evidenceFrames = [
    ...orderFrames.map((frame) => ({ source: "boxing", ...frame })),
    ...returnFrames.map((frame) => ({ source: "return-opening", ...frame })),
  ];
  const prompt = `So sánh các frame video bằng chứng theo thứ tự đính kèm. Frame của video đóng hàng đứng trước, tiếp theo là frame của video mở hàng. Serial order: ${order.serial ?? "unknown"}. Serial return: ${returnOrder.serial ?? "unknown"}. OpenCV pixel metrics: ${JSON.stringify(visualMetrics)}.
Chỉ kết luận MATCH nếu ít nhất hai frame ở mỗi video cho thấy rõ cùng một sản phẩm và đặc điểm nhận dạng/phụ kiện nhất quán. Chỉ kết luận MISMATCH nếu nhìn thấy khác biệt cụ thể, rõ ràng về loại sản phẩm, màu, hình dáng hoặc phụ kiện. Nếu video mờ, góc quay khác nhiều, không thấy đủ sản phẩm/phụ kiện, hoặc bằng chứng không chắc chắn thì bắt buộc NEEDS_REVIEW; không suy đoán và không kết luận MATCH dựa trên serial hay metric pixel.
Trả duy nhất JSON theo schema: {"status":"MATCH|MISMATCH|NEEDS_REVIEW","confidence":0.0,"visualClarity":"clear|unclear","explanation":"lý do ngắn gọn","differences":["khác biệt quan sát được"]}. Confidence từ 0 đến 1. differences phải rỗng nếu không thấy khác biệt cụ thể.`;
  const response = await ollama.chat({
    model: process.env.OLLAMA_MODEL ?? "gemma4:e2b",
    messages: [
      {
        role: "user",
        content: prompt,
        images: evidenceFrames.map(({ image }) => image),
      },
    ],
    format: "json",
    options: { temperature: 0 },
    stream: false,
  });
  const sufficientFrames = orderFrames.length >= 2 && returnFrames.length >= 2;
  const result = parseModelAnalysis(response.message.content, sufficientFrames);
  result.evidence = evidenceFrames.map(
    ({ source, timestampSeconds, image }) => ({
      source,
      timestampSeconds,
      imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
    }),
  );
  result.visualMetrics = visualMetrics;
  result.order = { id: order._id.toString(), serial: order.serial };
  result.returnOrder = {
    id: returnOrder._id.toString(),
    serial: returnOrder.serial,
  };
  return result;
}

export async function compareProductVideo({ orderId, returnOrderId } = {}) {
  if (
    !mongoose.isValidObjectId(orderId) ||
    !mongoose.isValidObjectId(returnOrderId)
  ) {
    return reviewResult("Cần truyền orderId và returnOrderId hợp lệ.");
  }

  const [order, returnOrder] = await Promise.all([
    Order.findById(orderId).select("serial name videoBoxingUrl").lean(),
    ReturnOrder.findById(returnOrderId).select("serial returnVideoUrl").lean(),
  ]);
  if (!order) return reviewResult("Không tìm thấy Order theo orderId.");
  if (!returnOrder)
    return reviewResult("Không tìm thấy ReturnOrder theo returnOrderId.");
  if (!order.videoBoxingUrl || !returnOrder.returnVideoUrl) {
    return reviewResult("Một trong hai bản ghi không có URL video để so sánh.");
  }

  const tempDirectory = await mkdtemp(
    path.join(tmpdir(), "product-video-compare-"),
  );
  const orderPath = path.join(tempDirectory, "boxing-video");
  const returnPath = path.join(tempDirectory, "return-video");

  try {
    const downloads = await Promise.allSettled([
      downloadVideo(order.videoBoxingUrl, orderPath),
      downloadVideo(returnOrder.returnVideoUrl, returnPath),
    ]);
    const downloadFailure = downloads.find(
      ({ status }) => status === "rejected",
    );
    if (downloadFailure) throw downloadFailure.reason;

    const frameResults = await Promise.allSettled([
      extractVideoFrames(orderPath),
      extractVideoFrames(returnPath),
    ]);
    const frameFailure = frameResults.find(
      ({ status }) => status === "rejected",
    );
    if (frameFailure) throw frameFailure.reason;
    const [orderFrames, returnFrames] = frameResults.map(({ value }) => value);
    if (!orderFrames.length || !returnFrames.length) {
      return reviewResult(
        "Không trích xuất đủ frame từ cả hai video để kết luận.",
      );
    }

    const cv = await openCvPromise;
    const visualMetrics = compareFrameSets(cv, orderFrames, returnFrames);
    try {
      return await analyzeFrames({
        order,
        returnOrder,
        orderFrames,
        returnFrames,
        visualMetrics,
      });
    } catch {
      const evidence = [
        ...orderFrames.map(({ timestampSeconds, image }) => ({
          source: "boxing",
          timestampSeconds,
          imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
        })),
        ...returnFrames.map(({ timestampSeconds, image }) => ({
          source: "return-opening",
          timestampSeconds,
          imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
        })),
      ];
      const result = reviewResult(
        "Không nhận được phân tích hợp lệ từ Gemma; không tự kết luận MATCH hoặc MISMATCH.",
        evidence,
      );
      result.visualMetrics = visualMetrics;
      result.order = { id: order._id.toString(), serial: order.serial };
      result.returnOrder = {
        id: returnOrder._id.toString(),
        serial: returnOrder.serial,
      };
      return result;
    }
  } catch (error) {
    return reviewResult(
      `Không thể phân tích video: ${error instanceof Error ? error.message : "lỗi không xác định"}`,
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
