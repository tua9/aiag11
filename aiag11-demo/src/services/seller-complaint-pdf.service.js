import { createWriteStream, existsSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import Order from "../models/order.model.js";
import ReturnOrder from "../models/return-order.model.js";

const outputDirectory = fileURLToPath(
  new URL("../../assets/generated-complaints/", import.meta.url),
);
const pageWidth = 595.28;
const left = 40;
const contentWidth = pageWidth - left * 2;
const navy = "#183b63";
const lightBlue = "#eaf0f6";
const gray = "#68717b";
const lineColor = "#b8c0c8";

function findFont(kind) {
  const override = process.env[`PDF_${kind.toUpperCase()}_FONT_PATH`];
  const candidates = [
    override,
    kind === "bold"
      ? "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
      : "/System/Library/Fonts/Supplemental/Arial.ttf",
    kind === "bold"
      ? "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
      : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    kind === "bold"
      ? "C:\\Windows\\Fonts\\arialbd.ttf"
      : "C:\\Windows\\Fonts\\arial.ttf",
  ];
  const fontPath = candidates.find(
    (candidate) => candidate && existsSync(candidate),
  );
  if (!fontPath) {
    throw new Error(
      `Không tìm thấy font tiếng Việt cho PDF. Hãy cấu hình PDF_${kind.toUpperCase()}_FONT_PATH.`,
    );
  }
  return fontPath;
}

function markMock(value) {
  return `${value} [MOCK]`;
}

function normalizeVietnameseText(value) {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d");
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function getComplaintSelections(description) {
  const text = normalizeVietnameseText(description);
  const has = (...phrases) => includesAny(text, phrases);
  const damaged = has(
    "hu hong",
    "bi hong",
    "tray xuoc",
    "tray",
    "xuoc",
    "vo",
    "be",
    "mop",
  );
  const brokenSeal =
    has("niem phong", "tem") && has("mo", "rach", "phat", "thay doi", "bi pha");
  const refundRejection =
    (has("tu choi") && has("hoan tien")) || has("huy yeu cau hoan tien");
  const inspectShipping =
    has("kiem tra", "doi chieu") && has("van chuyen", "camera");

  return {
    wrongProduct: has(
      "sai san pham",
      "san pham khac",
      "khong dung san pham",
      "khong dung mo ta",
      "trao nham",
      "nham hang",
    ),
    missingItems: has(
      "thieu so luong",
      "thieu phu kien",
      "thieu hang",
      "thieu do",
    ),
    damaged,
    usedProduct: has("da qua su dung", "da su dung", "co dau hieu su dung"),
    brokenSeal,
    otherDiscrepancy: has(
      "ly do khac",
      "khong khop video",
      "khong trung khop video",
    ),
    rejectRefundRequested: refundRejection,
    keepOrderAmount: has(
      "giu nguyen so tien",
      "khong hoan tien",
      "khong chap nhan hoan tien",
    ),
    inspectShipping,
    requestCompensation: has("boi hoan", "boi thuong", "yeu cau san boi"),
    otherResolution: has("yeu cau khac"),
    boxingEvidence:
      has("video") && has("dong goi", "dong hang", "truoc khi gui"),
    returnOpeningEvidence:
      has("video") && has("mo kien", "mo hang", "hang hoan", "mo hop"),
    returnPhotos:
      has("anh", "hinh") &&
      has("hang hoan", "tem niem phong", "san pham nhan ve"),
    shippingDocuments: has("phieu gui", "hoa don", "ma van don", "van don"),
    orderScreenshots: has("anh chup man hinh", "screenshot"),
    otherEvidence: has("tai lieu khac", "bang chung khac", "chung cu khac"),
  };
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("vi-VN");
}

function text(doc, value, x, y, width, options = {}) {
  const { bold = false, size = 7.2, color = "#26313b", ...rest } = options;
  doc
    .font(bold ? "bold" : "regular")
    .fontSize(size)
    .fillColor(color)
    .text(String(value ?? "—"), x, y, {
      width,
      lineBreak: false,
      ellipsis: true,
      ...rest,
    });
}

function sectionTitle(doc, label, y) {
  text(doc, label, left, y, contentWidth, {
    bold: true,
    size: 8.1,
    color: navy,
  });
  doc
    .moveTo(left, y + 12)
    .lineTo(left + contentWidth, y + 12)
    .lineWidth(0.55)
    .strokeColor(lineColor)
    .stroke();
}

function drawFields(doc, y, rows) {
  const labelWidth = 165;
  const rowHeight = 16;
  rows.forEach(([label, value], index) => {
    const rowY = y + index * rowHeight;
    doc
      .rect(left, rowY, contentWidth, rowHeight)
      .fillAndStroke(index % 2 === 0 ? "#ffffff" : "#fbfcfd", lineColor);
    doc
      .rect(left, rowY, labelWidth, rowHeight)
      .fillAndStroke(lightBlue, lineColor);
    text(doc, label, left + 6, rowY + 4, labelWidth - 11, { size: 6.8 });
    text(
      doc,
      value,
      left + labelWidth + 6,
      rowY + 4,
      contentWidth - labelWidth - 12,
      {
        size: 6.8,
      },
    );
  });
  return y + rows.length * rowHeight;
}

function drawComparisonTable(doc, y, rows) {
  const widths = [140, 180, contentWidth - 320];
  const rowHeight = 15;
  const headers = ["Hạng mục", "Hàng đã gửi đi", "Hàng nhận hoàn về"];
  let currentY = y;

  [headers, ...rows].forEach((row, rowIndex) => {
    let currentX = left;
    row.forEach((value, cellIndex) => {
      const cellWidth = widths[cellIndex];
      doc
        .rect(currentX, currentY, cellWidth, rowHeight)
        .fillAndStroke(rowIndex === 0 ? lightBlue : "#ffffff", lineColor);
      text(doc, value, currentX + 5, currentY + 4, cellWidth - 9, {
        bold: rowIndex === 0 || cellIndex === 0,
        size: rowIndex === 0 ? 6.5 : 6.4,
        color: rowIndex === 0 ? navy : "#26313b",
      });
      currentX += cellWidth;
    });
    currentY += rowHeight;
  });
  return currentY;
}

function drawCheckbox(doc, x, y, label, checked, width) {
  doc
    .rect(x, y + 1, 7, 7)
    .lineWidth(0.7)
    .strokeColor(gray)
    .stroke();
  if (checked) {
    doc
      .moveTo(x + 1, y + 5)
      .lineTo(x + 3, y + 7)
      .lineTo(x + 6, y + 2)
      .lineWidth(1)
      .strokeColor(navy)
      .stroke();
  }
  text(doc, label, x + 12, y, width - 12, { size: 6.6 });
}

function buildComplaintPdf(data, filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, compress: true });
    const output = createWriteStream(filePath);
    output.on("finish", resolve);
    output.on("error", reject);
    doc.on("error", reject);
    doc.registerFont("regular", findFont("regular"));
    doc.registerFont("bold", findFont("bold"));
    doc.pipe(output);

    text(doc, "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", left, 30, contentWidth, {
      bold: true,
      size: 9,
      align: "center",
    });
    text(doc, "Độc lập - Tự do - Hạnh phúc", left, 44, contentWidth, {
      bold: true,
      size: 8,
      align: "center",
    });
    doc
      .moveTo(248, 57)
      .lineTo(347, 57)
      .lineWidth(0.8)
      .strokeColor(navy)
      .stroke();
    text(doc, "ĐƠN KHIẾU NẠI CỦA NGƯỜI BÁN", left, 66, contentWidth, {
      bold: true,
      size: 14,
      align: "center",
      color: "#111827",
    });
    text(
      doc,
      "V/v: Hàng hoàn trả về không đúng với hàng đã gửi đi",
      left,
      86,
      contentWidth,
      {
        bold: true,
        size: 8,
        align: "center",
        color: navy,
      },
    );
    text(
      doc,
      "BẢN NHÁP - các trường thiếu thông tin được điền dữ liệu mô phỏng [MOCK]",
      left,
      101,
      contentWidth,
      { bold: true, size: 7, align: "center", color: "#a34232" },
    );
    text(
      doc,
      "Kính gửi: Bộ phận Giải quyết khiếu nại của sàn thương mại điện tử",
      left,
      119,
      contentWidth,
      { size: 7.2 },
    );

    sectionTitle(doc, "I. THÔNG TIN NGƯỜI BÁN", 139);
    drawFields(doc, 154, [
      ["Tên cửa hàng / Tên người bán", data.sellerName],
      ["Tên tài khoản (Shop ID)", data.shopId],
      ["Số điện thoại / Email", data.contact],
      ["Địa chỉ kho gửi / nhận hàng hoàn", data.warehouse],
    ]);

    sectionTitle(doc, "II. THÔNG TIN ĐƠN HÀNG", 226);
    drawFields(doc, 241, [
      ["Serial", data.serial],
      [
        "Ngày gửi / Ngày nhận hàng hoàn",
        `${data.sentDate} / ${data.returnDate}`,
      ],
      [
        "Mã vận đơn gửi đi / Mã vận đơn hoàn",
        `${data.outboundTracking} / ${data.returnTracking}`,
      ],
      ["Đơn vị vận chuyển", data.carrier],
      ["Lý do người mua yêu cầu hoàn", data.returnReason],
    ]);

    sectionTitle(doc, "III. ĐỐI CHIẾU HÀNG GỬI ĐI VÀ HÀNG HOÀN VỀ", 337);
    drawComparisonTable(doc, 352, [
      ["Tên sản phẩm / Mã SKU", data.product, data.returnedProduct],
      ["Số lượng", data.quantity, data.returnedQuantity],
      ["Màu / Kích thước", data.variant, data.returnedVariant],
      ["Tình trạng sản phẩm", data.sentCondition, data.returnedCondition],
      ["Phụ kiện / Tem niêm phong", data.accessories, data.returnedAccessories],
    ]);

    sectionTitle(
      doc,
      "IV. LOẠI SAI LỆCH PHÁT HIỆN (đánh dấu vào ô phù hợp)",
      457,
    );
    drawCheckbox(
      doc,
      left + 3,
      474,
      "Sai sản phẩm / không đúng mô tả",
      data.wrongProduct,
      250,
    );
    drawCheckbox(
      doc,
      left + 263,
      474,
      "Thiếu số lượng / phụ kiện",
      data.missingItems,
      250,
    );
    drawCheckbox(
      doc,
      left + 3,
      490,
      "Hàng bị hư hỏng, trầy xước",
      data.damaged,
      250,
    );
    drawCheckbox(
      doc,
      left + 263,
      490,
      "Hàng đã qua sử dụng",
      data.usedProduct,
      250,
    );
    drawCheckbox(
      doc,
      left + 3,
      506,
      "Niêm phong bị mở / rách / thay đổi",
      data.brokenSeal,
      250,
    );
    drawCheckbox(
      doc,
      left + 263,
      506,
      "Lý do khác: không khớp video",
      data.otherDiscrepancy,
      250,
    );

    sectionTitle(doc, "V. MÔ TẢ CHI TIẾT SỰ VIỆC", 527);
    text(doc, data.description, left + 2, 545, contentWidth - 4, {
      size: 7,
      lineBreak: true,
      height: 37,
    });
    doc
      .moveTo(left, 584)
      .lineTo(left + contentWidth, 584)
      .lineWidth(0.5)
      .strokeColor(lineColor)
      .stroke();
    doc
      .moveTo(left, 599)
      .lineTo(left + contentWidth, 599)
      .lineWidth(0.5)
      .strokeColor(lineColor)
      .stroke();

    sectionTitle(doc, "VI. YÊU CẦU GIẢI QUYẾT", 610);
    drawCheckbox(
      doc,
      left + 3,
      627,
      "Từ chối / hủy yêu cầu hoàn tiền cho đơn hàng này",
      data.rejectRefundRequested,
      255,
    );
    drawCheckbox(
      doc,
      left + 263,
      627,
      "Giữ nguyên số tiền đơn hàng",
      data.keepOrderAmount,
      250,
    );
    drawCheckbox(
      doc,
      left + 3,
      642,
      "Kiểm tra, đối chiếu dữ liệu vận chuyển và camera",
      data.inspectShipping,
      255,
    );
    drawCheckbox(
      doc,
      left + 263,
      642,
      "Yêu cầu bồi hoàn theo chính sách sàn",
      data.requestCompensation,
      250,
    );
    drawCheckbox(
      doc,
      left + 3,
      657,
      "Yêu cầu khác: xem xét bảo vệ quyền lợi người bán",
      data.otherResolution,
      255,
    );

    sectionTitle(doc, "VII. TÀI LIỆU, BẰNG CHỨNG ĐÍNH KÈM", 678);
    drawCheckbox(
      doc,
      left + 3,
      695,
      "Ảnh/video đóng gói trước khi gửi",
      true,
      250,
    );
    drawCheckbox(
      doc,
      left + 263,
      695,
      "Video mở kiện hàng hoàn (liên tục)",
      true,
      250,
    );
    drawCheckbox(
      doc,
      left + 3,
      710,
      "Ảnh chụp hàng hoàn về, tem niêm phong",
      data.returnPhotos,
      250,
    );
    drawCheckbox(
      doc,
      left + 263,
      710,
      "Phiếu gửi hàng, hóa đơn, mã vận đơn",
      data.shippingDocuments,
      250,
    );
    drawCheckbox(
      doc,
      left + 3,
      725,
      "Ảnh chụp màn hình đơn hàng, yêu cầu hoàn",
      data.orderScreenshots,
      250,
    );
    drawCheckbox(
      doc,
      left + 263,
      725,
      "Khác: dữ liệu minh họa",
      data.otherEvidence,
      250,
    );

    text(
      doc,
      "Tôi cam kết các thông tin trên là trung thực; dữ liệu gắn [MOCK] chỉ dùng minh họa và cần được thay trước khi gửi.",
      left,
      749,
      contentWidth,
      { size: 6.7, color: gray },
    );
    text(
      doc,
      "TP. Hồ Chí Minh, ngày ...... tháng ...... năm 20......",
      left,
      773,
      contentWidth,
      {
        size: 7,
        align: "right",
      },
    );
    text(doc, "NGƯỜI KHIẾU NẠI", left, 790, contentWidth, {
      bold: true,
      size: 7.5,
      align: "right",
    });
    text(
      doc,
      "(Ký, ghi rõ họ tên và đóng dấu nếu có)",
      left,
      803,
      contentWidth,
      {
        size: 6.5,
        align: "right",
        color: gray,
      },
    );
    text(doc, `Mã tham chiếu: ${data.reference}`, left, 823, contentWidth, {
      size: 6,
      color: gray,
    });

    doc.end();
  });
}

export async function createSellerComplaintPdf({
  serial,
  issueDescription,
} = {}) {
  const normalizedSerial =
    typeof serial === "string" || typeof serial === "number"
      ? String(serial).trim()
      : "";
  const normalizedIssueDescription =
    typeof issueDescription === "string"
      ? issueDescription.trim().slice(0, 500)
      : "";
  const [order, returnOrder] = normalizedSerial
    ? await Promise.all([
        Order.findOne({ serial: normalizedSerial })
          .select("serial name createdAt")
          .lean(),
        ReturnOrder.findOne({ serial: normalizedSerial })
          .select("serial status createdAt")
          .sort({ createdAt: -1 })
          .lean(),
      ])
    : [null, null];

  const today = new Date();
  const sampleSerial = normalizedSerial || "SKU-MOCK-2026-001";
  const mockDescription = `Đơn ${sampleSerial}: hàng hoàn về bị trầy xước và thiếu phụ kiện so với lúc gửi. Đề nghị kiểm tra, đối chiếu dữ liệu vận chuyển và camera.`;
  const descriptionForSelections =
    normalizedIssueDescription || mockDescription;
  const selections = getComplaintSelections(descriptionForSelections);
  const data = {
    sellerName: markMock("Cửa hàng Demo Việt"),
    shopId: markMock("demo-shop-2026"),
    contact: markMock("0900 000 123 / seller@example.test"),
    warehouse: markMock("12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh"),
    serial: order?.serial || sampleSerial,
    sentDate: order?.createdAt
      ? formatDate(order.createdAt)
      : markMock(formatDate(today)),
    returnDate: returnOrder?.createdAt
      ? formatDate(returnOrder.createdAt)
      : markMock(formatDate(today)),
    outboundTracking: markMock("VCN-MOCK-0026"),
    returnTracking: markMock("VCN-MOCK-0027"),
    carrier: markMock("Viettel Post"),
    returnReason: markMock("Sản phẩm không đúng mô tả"),
    product: `${order?.name || markMock("Tai nghe không dây Demo")} / ${sampleSerial}`,
    returnedProduct: markMock("Sản phẩm hoàn về có sai lệch"),
    quantity: markMock("01 sản phẩm"),
    returnedQuantity: markMock("01 sản phẩm"),
    variant: markMock("Màu đen / size tiêu chuẩn"),
    returnedVariant: markMock("Màu đen / size tiêu chuẩn"),
    sentCondition: markMock("Nguyên vẹn, đủ phụ kiện, còn niêm phong"),
    returnedCondition: markMock("Có vết xước, thiếu phụ kiện"),
    accessories: markMock("Cáp sạc, hộp, tem niêm phong"),
    returnedAccessories: markMock("Thiếu cáp sạc"),
    description: normalizedIssueDescription || markMock(mockDescription),
    ...selections,
    reference: `SC-${today.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
  };

  await mkdir(outputDirectory, { recursive: true });
  const fileSerial =
    sampleSerial.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unknown";
  const fileName = `seller-complaint-${fileSerial}-${randomUUID().slice(0, 8).toUpperCase()}.pdf`;
  const filePath = path.join(outputDirectory, fileName);
  await buildComplaintPdf(data, filePath);

  if (returnOrder?._id) {
    try {
      const update = await ReturnOrder.updateOne(
        { _id: returnOrder._id },
        { $set: { status: "rejected" } },
      );
      if (update.matchedCount !== 1) {
        throw new Error("Không tìm thấy return-order để cập nhật trạng thái.");
      }
    } catch (error) {
      await unlink(filePath).catch(() => {});
      throw error;
    }
  }

  const baseUrl = (
    process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3000}`
  ).replace(/\/$/, "");
  const statusNote = returnOrder?._id
    ? "Return-order tương ứng đã được chuyển sang rejected."
    : normalizedSerial
      ? "Không tìm thấy return-order theo serial nên không có trạng thái nào được cập nhật."
      : "Không truyền serial nên chỉ tạo PDF mock, không cập nhật return-order nào.";
  return {
    fileName,
    downloadUrl: `${baseUrl}/files/complaints/${fileName}`,
    serial: sampleSerial,
    returnOrderStatus: returnOrder?._id ? "rejected" : null,
    note: `Đơn đã được tạo; các trường có [MOCK] cần được xác nhận trước khi gửi. ${statusNote}`,
  };
}
