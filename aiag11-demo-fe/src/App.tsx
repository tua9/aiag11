import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  confirmOrder,
  createOrder,
  getOrder,
  getOrders,
  getReturnOrders,
  getApiErrorMessage,
  type OrderRecord,
  type ReturnOrderRecord,
  sendChatMessage,
  updateOrder,
  uploadReturnVideo,
} from "./api";
import ReactMarkdown from "react-markdown";
import "./App.css";

type VideoUpload = { name: string; dataUrl: string; size: number };
type ChatMessage = { role: "user" | "assistant"; text: string };
type NewOrder = {
  orderCode: string;
  serial: string;
  name: string;
  price: string;
  address: string;
  customerName: string;
  customerAddress: string;
  phoneNumber: string;
  payMethod: string;
};
type AppPage =
  | "overview"
  | "create-order"
  | "orders"
  | "returns"
  | "edit-order";

const returnStatusLabels = {
  pending: "Chờ xử lý",
  accepted: "Đã nhận",
  rejected: "Từ chối",
} as const;

const emptyOrderForm = (): NewOrder => ({
  orderCode: "",
  serial: "",
  name: "",
  price: "",
  address: "",
  customerName: "",
  customerAddress: "",
  phoneNumber: "",
  payMethod: "",
});

function pageFromPath(path: string): AppPage {
  if (path === "/orders/new") return "create-order";
  if (path === "/orders") return "orders";
  if (path === "/returns") return "returns";
  if (/^\/orders\/[^/]+$/.test(path)) return "edit-order";
  return "overview";
}

function orderCodeFromPath(path: string) {
  const match = path.match(/^\/orders\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

const orderFields = [
  ["orderCode", "Mã đơn hàng", "VD: ORD-001", "text"],
  ["serial", "Serial", "Nhập serial sản phẩm", "text"],
  ["name", "Tên sản phẩm", "Nhập tên sản phẩm", "text"],
  ["price", "Giá", "0", "number"],
  ["address", "Địa chỉ giao hàng", "Nhập địa chỉ", "text"],
  ["customerName", "Tên khách hàng", "Nhập tên khách hàng", "text"],
  ["customerAddress", "Địa chỉ khách hàng", "Nhập địa chỉ khách hàng", "text"],
  ["phoneNumber", "Số điện thoại", "Nhập số điện thoại", "tel"],
  ["payMethod", "Phương thức thanh toán", "VD: COD, chuyển khoản", "text"],
] as const;

const MAX_RETURN_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = 29 * 1000 * 1000;

function formatAgentMarkdown(text: string) {
  return text.replace(/[ \t]+(?=\d+\.\s+\*\*)/g, "\n");
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Không thể đọc tệp ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const activePage = pageFromPath(path);
  const currentOrderCode = orderCodeFromPath(path);
  const [orderCode, setOrderCode] = useState("");
  const [serialCode, setSerialCode] = useState("");
  const [returnVideo, setReturnVideo] = useState<VideoUpload | null>(null);
  const [boxingVideo, setBoxingVideo] = useState<File | null>(null);
  const [newOrder, setNewOrder] = useState<NewOrder>(emptyOrderForm);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(
    () => pageFromPath(window.location.pathname) === "orders",
  );
  const [ordersError, setOrdersError] = useState("");
  const [ordersSearch, setOrdersSearch] = useState("");
  const [returnOrders, setReturnOrders] = useState<ReturnOrderRecord[]>([]);
  const [returnOrdersLoading, setReturnOrdersLoading] = useState(
    () => pageFromPath(window.location.pathname) === "returns",
  );
  const [returnOrdersError, setReturnOrdersError] = useState("");
  const [returnOrdersSearch, setReturnOrdersSearch] = useState("");
  const [editingOrder, setEditingOrder] = useState<OrderRecord | null>(null);
  const [editOrderForm, setEditOrderForm] = useState<NewOrder>(emptyOrderForm);
  const [editVideo, setEditVideo] = useState<File | null>(null);
  const [editLoading, setEditLoading] = useState(
    () => pageFromPath(window.location.pathname) === "edit-order",
  );
  const [editBusy, setEditBusy] = useState(false);
  const [editFeedback, setEditFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [issueDescription, setIssueDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [confirmationFeedback, setConfirmationFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Xin chào. Tôi có thể giúp đối soát đơn hàng hoặc tạo claim sau khi bạn xác nhận lỗi.",
    },
  ]);
  const chatTranscriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncPage = () => {
      navigateToPath(window.location.pathname, false);
    };
    window.addEventListener("popstate", syncPage);
    return () => window.removeEventListener("popstate", syncPage);
  }, []);

  useEffect(() => {
    if (activePage !== "orders") return;
    let active = true;
    getOrders()
      .then((result) => {
        if (active) {
          setOrders(result);
          setOrdersError("");
        }
      })
      .catch((error) => {
        if (active)
          setOrdersError(
            getApiErrorMessage(error, "Không thể tải danh sách đơn hàng."),
          );
      })
      .finally(() => {
        if (active) setOrdersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "returns") return;
    let active = true;
    getReturnOrders()
      .then((result) => {
        if (active) {
          setReturnOrders(result);
          setReturnOrdersError("");
        }
      })
      .catch((error) => {
        if (active)
          setReturnOrdersError(
            getApiErrorMessage(error, "Không thể tải danh sách hàng hoàn trả."),
          );
      })
      .finally(() => {
        if (active) setReturnOrdersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "edit-order" || !currentOrderCode) return;
    let active = true;
    getOrder(currentOrderCode)
      .then((order) => {
        if (!active) return;
        setEditingOrder(order);
        setEditOrderForm({
          orderCode: order.orderCode ?? "",
          serial: order.serial,
          name: order.name ?? "",
          price: String(order.price ?? ""),
          address: order.address ?? "",
          customerName: order.customerName ?? "",
          customerAddress: order.customerAddress ?? "",
          phoneNumber: order.phoneNumber ?? "",
          payMethod: order.payMethod ?? "",
        });
        setEditVideo(null);
      })
      .catch((error) => {
        if (active)
          setEditFeedback({
            kind: "error",
            text: getApiErrorMessage(
              error,
              "Không thể tải thông tin đơn hàng.",
            ),
          });
      })
      .finally(() => {
        if (active) setEditLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activePage, currentOrderCode]);

  useEffect(() => {
    const transcript = chatTranscriptRef.current;
    transcript?.scrollTo({
      top: transcript.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages, chatBusy]);

  const navigateTo = (page: "overview" | "create-order") => {
    const path = page === "create-order" ? "/orders/new" : "/";
    navigateToPath(path);
  };

  function navigateToPath(targetPath: string, pushHistory = true) {
    if (pushHistory && window.location.pathname !== targetPath)
      window.history.pushState(null, "", targetPath);
    setPath(targetPath);
    const targetPage = pageFromPath(targetPath);
    if (targetPage === "orders") {
      setOrdersLoading(true);
      setOrdersError("");
    }
    if (targetPage === "returns") {
      setReturnOrdersLoading(true);
      setReturnOrdersError("");
    }
    if (targetPage === "edit-order") {
      setEditLoading(true);
      setEditFeedback(null);
      setEditingOrder(null);
    }
  }

  const addVideo = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_RETURN_VIDEO_BYTES) {
      setUploadFeedback({
        kind: "error",
        text: "Video hàng hoàn trả không được vượt quá 20 MB.",
      });
      return;
    }
    try {
      const video = {
        name: file.name,
        dataUrl: await readAsDataUrl(file),
        size: file.size,
      };
      setReturnVideo(video);
      setUploadFeedback(null);
    } catch (error) {
      setUploadFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Không thể đọc video.",
      });
    }
  };

  const submitReturnVideo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadFeedback(null);
    if (!returnVideo) {
      setUploadFeedback({
        kind: "error",
        text: "Hãy chọn video hàng hoàn trả.",
      });
      return;
    }

    const payload = {
      ...(serialCode.trim() ? { serialCode: serialCode.trim() } : {}),
      returnVideo: returnVideo.dataUrl,
    };
    const requestBody = JSON.stringify(payload);
    const requestSize = new TextEncoder().encode(requestBody).byteLength;
    if (requestSize > MAX_REQUEST_BYTES) {
      setUploadFeedback({
        kind: "error",
        text: "Dữ liệu video vượt giới hạn cho phép. Hãy chọn video nhỏ hơn.",
      });
      return;
    }

    setUploadBusy(true);
    try {
      const result = await uploadReturnVideo(payload);
      const matchSummary =
        result.comparison?.sameProduct === true
          ? "Vật phẩm giống video đóng gói."
          : result.comparison?.sameProduct === false
            ? "Phát hiện khác biệt giữa hai video."
            : "Chưa đủ dữ liệu để kết luận so sánh.";
      const resultDetails = [
        result.qrCodes?.length
          ? `QR: ${result.qrCodes.slice(0, 3).join(", ")}`
          : "Không đọc được mã QR",
        result.serialCode
          ? `Serial QR: ${result.serialCode}`
          : "Không đọc được serial từ QR",
        result.order?.orderCode
          ? `Order: ${result.order.orderCode} · ${result.order.name}`
          : result.checkStatus === "order_not_found"
            ? "Không tìm thấy order theo serial QR"
            : "",
        result.identifiedItem?.item
          ? `Vật phẩm: ${result.identifiedItem.item}${result.identifiedItem.visibleDetails ? ` (${result.identifiedItem.visibleDetails})` : ""}`
          : "",
        result.order ? matchSummary : "",
        result.comparison?.reason
          ? `Phân tích: ${result.comparison.reason}`
          : result.comparison?.differences
            ? `Khác biệt: ${Array.isArray(result.comparison.differences) ? result.comparison.differences.join(", ") : result.comparison.differences}`
            : "",
        result.processingErrors?.length
          ? `Cần kiểm tra thêm: ${result.processingErrors.join("; ")}`
          : "",
      ].filter(Boolean);
      setUploadFeedback({
        kind: result.checkStatus === "matched" ? "success" : "error",
        text:
          resultDetails.join(" · ") || "Đã lưu report kiểm tra video hoàn trả.",
      });
    } catch (error) {
      setUploadFeedback({
        kind: "error",
        text: getApiErrorMessage(error, "Không thể tải video hàng hoàn trả."),
      });
    } finally {
      setUploadBusy(false);
    }
  };

  const submitNewOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setOrderFeedback(null);
    if (!boxingVideo) {
      setOrderFeedback({ kind: "error", text: "Hãy chọn video đóng gói." });
      return;
    }

    const payload = new FormData();
    Object.entries(newOrder).forEach(([field, value]) =>
      payload.append(field, value.trim()),
    );
    payload.append("videoBoxing", boxingVideo);

    setCreateBusy(true);
    try {
      const created = await createOrder(payload);
      setOrderFeedback({
        kind: "success",
        text: `Đã tạo đơn ${created.orderCode} và lưu video lên Cloudinary.`,
      });
      setNewOrder(emptyOrderForm());
      setBoxingVideo(null);
      form.reset();
    } catch (error) {
      setOrderFeedback({
        kind: "error",
        text: getApiErrorMessage(error, "Không thể tạo đơn hàng."),
      });
    } finally {
      setCreateBusy(false);
    }
  };

  const submitEditOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentOrderCode) return;
    const form = event.currentTarget;
    setEditFeedback(null);
    const payload = new FormData();
    Object.entries(editOrderForm).forEach(([field, value]) => {
      if (field !== "orderCode") payload.append(field, value.trim());
    });
    if (editVideo) payload.append("videoBoxing", editVideo);

    setEditBusy(true);
    try {
      const updated = await updateOrder(currentOrderCode, payload);
      setEditingOrder(updated);
      setOrders((current) =>
        current.map((order) =>
          order.orderCode === updated.orderCode ? updated : order,
        ),
      );
      setEditVideo(null);
      form.reset();
      setEditFeedback({
        kind: "success",
        text: "Đã cập nhật thông tin đơn hàng.",
      });
    } catch (error) {
      setEditFeedback({
        kind: "error",
        text: getApiErrorMessage(error, "Không thể cập nhật đơn hàng."),
      });
    } finally {
      setEditBusy(false);
    }
  };

  const submitConfirmation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setConfirmationFeedback(null);
    if (!confirmed || !issueDescription.trim() || !orderCode.trim()) return;

    setConfirmationBusy(true);
    try {
      await confirmOrder(orderCode.trim(), issueDescription.trim());
      setConfirmationFeedback({
        kind: "success",
        text: `Đã lưu xác nhận cho đơn ${orderCode.trim()}.`,
      });
    } catch (error) {
      setConfirmationFeedback({
        kind: "error",
        text: getApiErrorMessage(error, "Không thể lưu xác nhận."),
      });
    } finally {
      setConfirmationBusy(false);
    }
  };

  const submitChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatMessages((current) => [...current, { role: "user", text: message }]);
    setChatInput("");
    setChatError("");
    setChatBusy(true);
    try {
      const result = await sendChatMessage(message);
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: result.answer || "Agent chưa trả về nội dung.",
        },
      ]);
    } catch (error) {
      setChatError(getApiErrorMessage(error, "Không thể kết nối Agent."));
    } finally {
      setChatBusy(false);
    }
  };

  const renderVideoPreview = (video: VideoUpload | null) => {
    if (!video) return null;
    return (
      <div className="video-preview">
        <video
          controls
          preload="metadata"
          src={video.dataUrl}
          aria-label={video.name}
        />
        <div className="video-file-line">
          <span title={video.name}>{video.name}</span>
          <button
            type="button"
            className="remove-video"
            aria-label={`Xóa video ${video.name}`}
            title="Xóa video"
            onClick={() => setReturnVideo(null)}
          >
            ×
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="FixIt home">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>FixIt</span>
        </a>
        <nav className="topnav" aria-label="Điều hướng chính">
          <a
            href="/"
            className={activePage === "overview" ? "active" : ""}
            aria-current={activePage === "overview" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              navigateTo("overview");
            }}
          >
            Tổng quan
          </a>
          <a
            href="/orders"
            className={
              activePage === "orders" || activePage === "edit-order"
                ? "active"
                : ""
            }
            aria-current={
              activePage === "orders" || activePage === "edit-order"
                ? "page"
                : undefined
            }
            onClick={(event) => {
              event.preventDefault();
              navigateToPath("/orders");
            }}
          >
            Đơn hàng
          </a>
          <a
            href="/returns"
            className={activePage === "returns" ? "active" : ""}
            aria-current={activePage === "returns" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              navigateToPath("/returns");
            }}
          >
            Hàng hoàn trả
          </a>
          <a
            href="/orders/new"
            className={activePage === "create-order" ? "active" : ""}
            aria-current={activePage === "create-order" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              navigateTo("create-order");
            }}
          >
            Tạo đơn
          </a>
        </nav>
        <div className="topbar-meta">
          <span className="environment">
            <span className="status-dot" /> LOCAL WORKSPACE
          </span>
          <span className="topbar-divider" />
          <span className="api-url">API · localhost:8888</span>
        </div>
      </header>

      <main id="main" className="workspace">
        <div
          className={`page-heading ${activePage === "create-order" || activePage === "edit-order" ? "create-heading" : ""}`}
        >
          <div>
            <p className="eyebrow">
              {activePage === "create-order"
                ? "ORDERS / NEW ORDER"
                : activePage === "orders"
                  ? "ORDERS / REGISTER"
                  : activePage === "returns"
                    ? "RETURNS / REGISTER"
                    : activePage === "edit-order"
                      ? `ORDERS / ${currentOrderCode}`
                      : "RETURNS / INSPECTION"}
            </p>
            <h1>
              {activePage === "create-order" ? (
                <>
                  Tạo <span>đơn hàng mới.</span>
                </>
              ) : activePage === "orders" ? (
                <>
                  Đơn <span>hàng.</span>
                </>
              ) : activePage === "returns" ? (
                <>
                  Hàng <span>hoàn trả.</span>
                </>
              ) : activePage === "edit-order" ? (
                <>
                  Chỉnh sửa <span>đơn hàng.</span>
                </>
              ) : (
                <>
                  Kiểm tra <span>hàng hoàn trả.</span>
                </>
              )}
            </h1>
            <p className="page-intro">
              {activePage === "create-order"
                ? "Nhập thông tin đơn hàng và tải video đóng gói lên cùng lúc."
                : activePage === "orders"
                  ? "Tra cứu đơn hàng, thông tin khách và video đóng gói."
                  : activePage === "returns"
                    ? "Theo dõi serial, trạng thái và video của hàng hoàn trả."
                    : activePage === "edit-order"
                      ? "Cập nhật thông tin hoặc thay video đóng gói."
                      : "Đối soát hàng hoàn trả, xác nhận vấn đề và trao đổi cùng Agent."}
            </p>
          </div>
          {activePage === "create-order" || activePage === "edit-order" ? (
            <button
              className="back-button"
              type="button"
              onClick={() => navigateToPath("/orders")}
            >
              <span aria-hidden="true">←</span> Danh sách đơn
            </button>
          ) : (
            <div className="heading-note">
              <span className="note-mark">↗</span>
              <span>
                Fulfillment
                <br />
                workspace
              </span>
            </div>
          )}
        </div>

        {activePage === "orders" ? (
          <section
            className="panel orders-panel"
            aria-labelledby="orders-title"
          >
            <div className="orders-toolbar">
              <div>
                <h2 id="orders-title">Danh sách đơn hàng</h2>
                <p>{orders.length} đơn hàng</p>
              </div>
              <div className="orders-actions">
                <label className="search-box">
                  <span className="search-icon" aria-hidden="true">
                    ⌕
                  </span>
                  <input
                    className="text-input"
                    type="search"
                    aria-label="Tìm đơn hàng"
                    placeholder="Tìm serial hoặc ID"
                    value={ordersSearch}
                    onChange={(event) => setOrdersSearch(event.target.value)}
                  />
                </label>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => navigateTo("create-order")}
                >
                  Tạo đơn <span aria-hidden="true">+</span>
                </button>
              </div>
            </div>
            {ordersLoading ? (
              <p className="orders-state">Đang tải đơn hàng...</p>
            ) : ordersError ? (
              <div className="feedback error" role="alert">
                {ordersError}
              </div>
            ) : orders.length === 0 ? (
              <div className="orders-state">Chưa có đơn hàng nào.</div>
            ) : (
              <div className="orders-table-wrap">
                <table className="orders-table">
                  <thead>
                    <tr>
                      <th>Serial</th>
                      <th>ID đơn hàng</th>
                      <th>Ngày tạo</th>
                      <th>Cập nhật</th>
                      <th>Video đóng gói</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders
                      .filter((order) =>
                        `${order.serial} ${order._id}`
                          .toLocaleLowerCase("vi")
                          .includes(
                            ordersSearch.trim().toLocaleLowerCase("vi"),
                          ),
                      )
                      .map((order) => (
                        <tr key={order._id}>
                          <td className="order-serial">{order.serial}</td>
                          <td className="order-id">{order._id}</td>
                          <td>
                            {new Date(order.createdAt).toLocaleString("vi-VN")}
                          </td>
                          <td>
                            {new Date(order.updatedAt).toLocaleString("vi-VN")}
                          </td>
                          <td>
                            {order.videoBoxingUrl ? (
                              <a
                                className="video-link"
                                href={order.videoBoxingUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Xem video ↗
                              </a>
                            ) : (
                              <span className="muted-value">Chưa có</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {orders.filter((order) =>
                  `${order.serial} ${order._id}`
                    .toLocaleLowerCase("vi")
                    .includes(ordersSearch.trim().toLocaleLowerCase("vi")),
                ).length === 0 && (
                  <div className="orders-state">
                    Không tìm thấy đơn hàng phù hợp.
                  </div>
                )}
              </div>
            )}
          </section>
        ) : activePage === "returns" ? (
          <section
            className="panel orders-panel"
            aria-labelledby="returns-title"
          >
            <div className="orders-toolbar">
              <div>
                <h2 id="returns-title">Danh sách hàng hoàn trả</h2>
                <p>{returnOrders.length} lượt hoàn trả</p>
              </div>
              <label className="search-box">
                <span className="search-icon" aria-hidden="true">
                  ⌕
                </span>
                <input
                  className="text-input"
                  type="search"
                  aria-label="Tìm hàng hoàn trả"
                  placeholder="Tìm serial hoặc ID"
                  value={returnOrdersSearch}
                  onChange={(event) =>
                    setReturnOrdersSearch(event.target.value)
                  }
                />
              </label>
            </div>
            {returnOrdersLoading ? (
              <p className="orders-state">Đang tải hàng hoàn trả...</p>
            ) : returnOrdersError ? (
              <div className="feedback error" role="alert">
                {returnOrdersError}
              </div>
            ) : returnOrders.length === 0 ? (
              <div className="orders-state">Chưa có lượt hoàn trả nào.</div>
            ) : (
              <div className="orders-table-wrap">
                <table className="orders-table returns-table">
                  <thead>
                    <tr>
                      <th>Serial</th>
                      <th>ID</th>
                      <th>Trạng thái</th>
                      <th>Ngày tạo</th>
                      <th>Cập nhật</th>
                      <th>Video hoàn trả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnOrders
                      .filter((returnOrder) =>
                        `${returnOrder.serial ?? ""} ${returnOrder._id}`
                          .toLocaleLowerCase("vi")
                          .includes(
                            returnOrdersSearch.trim().toLocaleLowerCase("vi"),
                          ),
                      )
                      .map((returnOrder) => (
                        <tr key={returnOrder._id}>
                          <td className="order-serial">
                            {returnOrder.serial || "—"}
                          </td>
                          <td className="order-id">{returnOrder._id}</td>
                          <td>
                            <span
                              className={`return-status ${returnOrder.status}`}
                            >
                              {returnStatusLabels[returnOrder.status]}
                            </span>
                          </td>
                          <td>
                            {new Date(returnOrder.createdAt).toLocaleString(
                              "vi-VN",
                            )}
                          </td>
                          <td>
                            {new Date(returnOrder.updatedAt).toLocaleString(
                              "vi-VN",
                            )}
                          </td>
                          <td>
                            <a
                              className="video-link"
                              href={returnOrder.returnVideoUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Xem video ↗
                            </a>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {returnOrders.filter((returnOrder) =>
                  `${returnOrder.serial ?? ""} ${returnOrder._id}`
                    .toLocaleLowerCase("vi")
                    .includes(
                      returnOrdersSearch.trim().toLocaleLowerCase("vi"),
                    ),
                ).length === 0 && (
                  <div className="orders-state">
                    Không tìm thấy lượt hoàn trả phù hợp.
                  </div>
                )}
              </div>
            )}
          </section>
        ) : activePage === "edit-order" ? (
          <section
            className="panel edit-order-panel"
            aria-labelledby="edit-order-title"
          >
            <div className="panel-heading">
              <div className="section-index">01</div>
              <div>
                <h2 id="edit-order-title">Cập nhật đơn hàng</h2>
                <p>Mã đơn hàng không thể thay đổi.</p>
              </div>
              <span className="method-tag">PATCH /orders/:orderCode</span>
            </div>
            {editLoading ? (
              <p className="orders-state">Đang tải thông tin đơn hàng...</p>
            ) : editingOrder ? (
              <>
                <div className="edit-order-meta">
                  <div>
                    <span className="meta-label">MÃ ĐƠN</span>
                    <strong>
                      {editingOrder.orderCode ?? editingOrder.serial}
                    </strong>
                  </div>
                  {editingOrder.videoBoxingUrl && (
                    <a
                      className="video-link"
                      href={editingOrder.videoBoxingUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mở video hiện tại ↗
                    </a>
                  )}
                </div>
                <form onSubmit={submitEditOrder}>
                  <div className="order-form-fields">
                    {orderFields
                      .slice(1)
                      .map(([field, label, placeholder, type]) => (
                        <div className="order-form-field" key={field}>
                          <label
                            className="field-label"
                            htmlFor={`edit-${field}`}
                          >
                            {label} <span className="required">*</span>
                          </label>
                          <input
                            id={`edit-${field}`}
                            className="text-input order-code-input"
                            type={type}
                            min={type === "number" ? "0" : undefined}
                            step={type === "number" ? "any" : undefined}
                            value={editOrderForm[field]}
                            onChange={(event) =>
                              setEditOrderForm((current) => ({
                                ...current,
                                [field]: event.target.value,
                              }))
                            }
                            placeholder={placeholder}
                            required
                          />
                        </div>
                      ))}
                  </div>
                  <div className="video-field order-video-field">
                    <div className="image-label-line">
                      <label
                        className="field-label"
                        htmlFor="edit-boxing-video"
                      >
                        Thay video đóng gói{" "}
                        <span className="optional-label">(Không bắt buộc)</span>
                      </label>
                      {editVideo && <span>Đã chọn video mới</span>}
                    </div>
                    <input
                      className="file-input"
                      id="edit-boxing-video"
                      type="file"
                      accept="video/*"
                      onChange={(event) =>
                        setEditVideo(event.target.files?.[0] ?? null)
                      }
                    />
                    <label
                      className="video-upload-zone"
                      htmlFor="edit-boxing-video"
                    >
                      <span className="video-symbol" aria-hidden="true">
                        ▷
                      </span>
                      <span>
                        {editVideo ? (
                          <strong title={editVideo.name}>
                            {editVideo.name}
                          </strong>
                        ) : (
                          <>
                            <strong>Chọn video mới</strong> để thay video hiện
                            tại
                          </>
                        )}
                      </span>
                      <small>Bỏ trống nếu không muốn thay video</small>
                    </label>
                  </div>
                  {editFeedback && (
                    <div
                      className={`feedback ${editFeedback.kind}`}
                      role="status"
                    >
                      {editFeedback.text}
                    </div>
                  )}
                  <div className="form-footer">
                    <span className="limit-note">
                      Video cũ sẽ được gỡ khỏi Cloudinary sau khi thay thành
                      công
                    </span>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={editBusy}
                    >
                      {editBusy ? "Đang lưu..." : "Lưu thay đổi"}{" "}
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </form>
              </>
            ) : (
              editFeedback && (
                <div className={`feedback ${editFeedback.kind}`} role="alert">
                  {editFeedback.text}
                </div>
              )
            )}
          </section>
        ) : (
          <div
            className={`content-grid ${activePage === "create-order" ? "create-only" : ""}`}
          >
            <section
              className={`panel order-panel ${activePage === "create-order" ? "order-panel-page" : ""}`}
              aria-labelledby="order-title"
            >
              <div className="panel-heading">
                <div className="section-index">01</div>
                <div>
                  <h2 id="order-title">
                    {activePage === "create-order"
                      ? "Thông tin đơn hàng"
                      : "Tải video hàng hoàn trả"}
                  </h2>
                  <p>
                    {activePage === "create-order"
                      ? "Video sẽ được lưu trên Cloudinary cùng đơn hàng."
                      : "Serial Code tùy chọn, chỉ tải video."}
                  </p>
                </div>
                <span className="method-tag">
                  {activePage === "create-order"
                    ? "POST /orders · multipart"
                    : "POST /orders/check-return"}
                </span>
              </div>

              {activePage === "create-order" ? (
                <form onSubmit={submitNewOrder}>
                  <div className="order-form-fields">
                    {orderFields.map(([field, label, placeholder, type]) => (
                      <div className="order-form-field" key={field}>
                        <label
                          className="field-label"
                          htmlFor={`order-${field}`}
                        >
                          {label} <span className="required">*</span>
                        </label>
                        <input
                          id={`order-${field}`}
                          className="text-input order-code-input"
                          type={type}
                          min={type === "number" ? "0" : undefined}
                          step={type === "number" ? "any" : undefined}
                          value={newOrder[field]}
                          onChange={(event) =>
                            setNewOrder((current) => ({
                              ...current,
                              [field]: event.target.value,
                            }))
                          }
                          placeholder={placeholder}
                          required
                        />
                      </div>
                    ))}
                  </div>
                  <div className="video-field order-video-field">
                    <div className="image-label-line">
                      <label className="field-label" htmlFor="boxing-video">
                        Video đóng gói <span className="required">*</span>
                      </label>
                      {boxingVideo && <span>Đã chọn</span>}
                    </div>
                    <input
                      className="file-input"
                      id="boxing-video"
                      type="file"
                      accept="video/*"
                      required={!boxingVideo}
                      onChange={(event) =>
                        setBoxingVideo(event.target.files?.[0] ?? null)
                      }
                    />
                    <label className="video-upload-zone" htmlFor="boxing-video">
                      <span className="video-symbol" aria-hidden="true">
                        ▷
                      </span>
                      <span>
                        {boxingVideo ? (
                          <strong title={boxingVideo.name}>
                            {boxingVideo.name}
                          </strong>
                        ) : (
                          <>
                            <strong>Chọn video</strong> đóng gói
                          </>
                        )}
                      </span>
                      <small>Video tối đa 100 MB</small>
                    </label>
                  </div>
                  {orderFeedback && (
                    <div
                      className={`feedback ${orderFeedback.kind}`}
                      role="status"
                    >
                      {orderFeedback.text}
                    </div>
                  )}
                  <div className="form-footer">
                    <span className="limit-note">
                      Video được lưu trên Cloudinary
                    </span>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={createBusy}
                    >
                      {createBusy ? "Đang tạo đơn..." : "Tạo đơn hàng"}{" "}
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={submitReturnVideo}>
                  <label className="field-label" htmlFor="serial-code">
                    Serial Code{" "}
                    <span className="optional-label">(Optional)</span>
                  </label>
                  <input
                    id="serial-code"
                    className="text-input order-code-input"
                    value={serialCode}
                    onChange={(event) => setSerialCode(event.target.value)}
                    placeholder="Nhập Serial Code nếu có"
                  />

                  <div className="video-fields single-video-field">
                    <div className="video-field">
                      <div className="image-label-line">
                        <label className="field-label" htmlFor="return-video">
                          Video hàng hoàn trả
                        </label>
                        {returnVideo && <span>Đã chọn</span>}
                      </div>
                      <input
                        className="file-input"
                        id="return-video"
                        type="file"
                        accept="video/*"
                        onChange={(event) => {
                          void addVideo(event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                      {!returnVideo && (
                        <label
                          className="video-upload-zone"
                          htmlFor="return-video"
                        >
                          <span className="video-symbol" aria-hidden="true">
                            ▷
                          </span>
                          <span>
                            <strong>Chọn video</strong> hàng hoàn trả
                          </span>
                          <small>MP4, MOV · gửi dạng Base64</small>
                        </label>
                      )}
                      {renderVideoPreview(returnVideo)}
                    </div>
                  </div>

                  {uploadFeedback && (
                    <div
                      className={`feedback ${uploadFeedback.kind}`}
                      role="status"
                    >
                      {uploadFeedback.text}
                    </div>
                  )}
                  <div className="form-footer">
                    <span className="limit-note">Video tối đa 20 MB</span>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={uploadBusy}
                    >
                      {uploadBusy ? "Đang tải video..." : "Tải video lên"}{" "}
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </form>
              )}
            </section>

            {activePage === "overview" && (
              <div className="side-column">
                <section
                  className="panel confirmation-panel"
                  aria-labelledby="confirmation-title"
                >
                  <div className="panel-heading compact-heading">
                    <div className="section-index coral-index">02</div>
                    <div>
                      <h2 id="confirmation-title">Xác nhận lỗi</h2>
                      <p>Chỉ gửi sau khi đã kiểm tra.</p>
                    </div>
                    <span className="method-tag">POST /confirmation</span>
                  </div>
                  <form onSubmit={submitConfirmation}>
                    <label className="field-label" htmlFor="order-code">
                      Mã đơn hàng <span className="required">*</span>
                    </label>
                    <input
                      id="order-code"
                      className="text-input order-code-input confirmation-order-code"
                      value={orderCode}
                      onChange={(event) => setOrderCode(event.target.value)}
                      placeholder="VD: ORD-001"
                      required
                    />
                    <label className="field-label" htmlFor="issue-description">
                      Mô tả vấn đề <span className="required">*</span>
                    </label>
                    <textarea
                      id="issue-description"
                      className="text-input issue-input"
                      value={issueDescription}
                      onChange={(event) =>
                        setIssueDescription(event.target.value)
                      }
                      placeholder="Mô tả tình trạng sản phẩm..."
                      required
                    />
                    <label className="confirm-check">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                      />
                      <span className="checkmark" aria-hidden="true" />
                      <span>Tôi xác nhận thông tin lỗi là chính xác</span>
                    </label>
                    {confirmationFeedback && (
                      <div
                        className={`feedback ${confirmationFeedback.kind}`}
                        role="status"
                      >
                        {confirmationFeedback.text}
                      </div>
                    )}
                    <button
                      className="secondary-button"
                      type="submit"
                      disabled={
                        !confirmed ||
                        !issueDescription.trim() ||
                        !orderCode.trim() ||
                        confirmationBusy
                      }
                    >
                      {confirmationBusy ? "Đang lưu..." : "Lưu xác nhận"}{" "}
                      <span aria-hidden="true">↗</span>
                    </button>
                  </form>
                </section>

                <section
                  className="panel chat-panel"
                  aria-labelledby="chat-title"
                >
                  <div className="panel-heading compact-heading chat-heading">
                    <div className="section-index chat-index">03</div>
                    <div>
                      <h2 id="chat-title">Trao đổi với Agent</h2>
                      <p>Đối soát đơn hàng hoặc tạo claim.</p>
                    </div>
                    <span className="agent-indicator">
                      <span className="status-dot" /> Agent
                    </span>
                  </div>
                  <div
                    className="chat-transcript"
                    ref={chatTranscriptRef}
                    aria-live="polite"
                    aria-label="Nội dung trao đổi"
                  >
                    {chatMessages.map((message, index) => (
                      <div
                        className={`chat-message ${message.role}`}
                        key={`${index}-${message.role}`}
                      >
                        {message.role === "assistant" && (
                          <span className="agent-avatar" aria-hidden="true">
                            A
                          </span>
                        )}
                        {message.role === "assistant" ? (
                          <div className="markdown-content">
                            <ReactMarkdown>
                              {formatAgentMarkdown(message.text)}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p>{message.text}</p>
                        )}
                      </div>
                    ))}
                    {chatBusy && (
                      <div className="chat-message assistant">
                        <span className="agent-avatar" aria-hidden="true">
                          A
                        </span>
                        <p className="typing-status">Đang xử lý...</p>
                      </div>
                    )}
                  </div>
                  {chatError && (
                    <div className="chat-error" role="alert">
                      {chatError}
                    </div>
                  )}
                  <form className="chat-form" onSubmit={submitChat}>
                    <input
                      className="text-input chat-input"
                      aria-label="Tin nhắn cho Agent"
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder="Nhập yêu cầu..."
                    />
                    <button
                      className="send-button"
                      type="submit"
                      title="Gửi tin nhắn"
                      aria-label="Gửi tin nhắn"
                      disabled={!chatInput.trim() || chatBusy}
                    >
                      <span aria-hidden="true">↑</span>
                    </button>
                  </form>
                  <p className="chat-hint">
                    Ví dụ: “Đối soát đơn hàng ORD-001”
                  </p>
                </section>
              </div>
            )}
          </div>
        )}
        <footer className="workspace-footer">
          <span>FULFILLMENT CONSOLE</span>
          <span>
            ORDER OPERATIONS <i />
          </span>
        </footer>
      </main>
    </div>
  );
}

export default App;
