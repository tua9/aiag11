export default function errorHandler(error, req, res, next) {
  console.error(error);

  const status =
    error.code === 11000
      ? 409
      : error.status === 413 || error.code === "LIMIT_FILE_SIZE"
        ? 413
        : error.name === "ValidationError" ||
            error.name === "CastError" ||
            error.name === "MulterError" ||
            error.status === 400
          ? 400
          : 500;

  res.status(status).json({
    error: status === 500 ? "Internal server error." : error.message,
  });
}
