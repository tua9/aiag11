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
        "Danh sách các đơn hàng hoàn trả hoặc tra cứu hàng hoàn trả theo serial. Có thể bỏ serial để lấy tối đa 20 lượt hoàn trả mới nhất.",
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
        "Tạo đơn khiếu nại người bán thành PDF theo serial. issueDescription không bắt buộc; nếu không có thì tự điền mô tả mô phỏng và đánh dấu [MOCK]. Tra cứu order/return-order theo serial, dữ liệu còn thiếu cũng được đánh dấu [MOCK]. Trả về URL tải file.",
      parameters: {
        type: "object",
        properties: {
          serial: {
            type: "string",
            description: "Serial sản phẩm trong order và return-order",
          },
          issueDescription: {
            type: "string",
            description:
              "Mô tả vấn đề; có thể bỏ trống để dùng mô tả mô phỏng [MOCK]",
          },
        },
        required: ["serial"],
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
