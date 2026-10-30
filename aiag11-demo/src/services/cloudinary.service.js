import { Readable } from "node:stream";
import cloudinary from "../config/cloudinary.js";

export function uploadVideo(buffer, folder) {
  if (!process.env.CLOUDINARY_URL) {
    throw new Error("Cloudinary credentials are not configured.");
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "video", folder },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url)
          return reject(new Error("Cloudinary did not return a secure URL."));
        return resolve(result.secure_url);
      },
    );

    Readable.from(buffer).pipe(uploadStream);
  });
}
