export const definitions = [
  {
    type: "function",
    function: {
      name: "get_orders",
      description:
        "Danh sách các đơn hàng hoặc tra cứu đơn hàng theo serial. Có thể bỏ serial để lấy tối đa 20 đơn mới nhất.",
      parameters: {
        type: "object",
        properties: {
          serial: {
            type: "string",
            description: "Serial cần tra cứu, ví dụ GYWV6VTK",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_return_orders",
      description:
        "Tra cứu hàng hoàn trả theo serial. Có thể bỏ serial để lấy tối đa 20 lượt hoàn trả mới nhất.",
      parameters: {
        type: "object",
        properties: {
          serial: {
            type: "string",
            description: "Serial cần tra cứu, ví dụ GYWV6VTK",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_seller_complaint_pdf",
      description:
        "Tạo đơn khiếu nại của người bán thành file PDF theo mẫu. Có thể truyền serial để điền dữ liệu đơn hàng và hàng hoàn; thông tin còn thiếu sẽ được điền dữ liệu mô phỏng và đánh dấu [MOCK]. Trả về URL tải file.",
      parameters: {
        type: "object",
        properties: {
          serial: {
            type: "string",
            description:
              "Serial sản phẩm để tra cứu order và return order (không bắt buộc)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_product_video",
      description:
        "So sánh video đóng hàng của Order và video mở hàng của ReturnOrder. Trả JSON status MATCH, MISMATCH hoặc NEEDS_REVIEW, giải thích, metric OpenCV và ảnh frame bằng chứng. Không tự kết luận MATCH nếu hình ảnh không đủ rõ.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "MongoDB _id của Order",
          },
          returnOrderId: {
            type: "string",
            description: "MongoDB _id của ReturnOrder",
          },
        },
        required: ["orderId", "returnOrderId"],
      },
    },
  },
];
