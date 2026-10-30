import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8888/api",
  headers: { "Content-Type": "application/json" },
});

export type ReturnVideoPayload = {
  serialCode?: string;
  returnVideo: string;
};

export type ReturnVideoResponse = {
  _id?: string;
  serialCode?: string;
  returnVideoUrl?: string;
  createdAt?: string;
  order?: { orderCode: string; serial: string; name: string } | null;
  qrCodes?: string[];
  checkStatus?: "matched" | "mismatch" | "review" | "order_not_found";
  identifiedItem?: { item?: string; visibleDetails?: string } | null;
  comparison?: {
    sameProduct?: boolean | null;
    confidence?: number;
    reason?: string;
    differences?: string[] | string;
  } | null;
  processingErrors?: string[];
  reportSaved?: boolean;
};

export type OrderRecord = {
  _id: string;
  orderCode: string;
  serial: string;
  name: string;
  price: number;
  address: string;
  customerName: string;
  customerAddress: string;
  phoneNumber: string;
  payMethod: string;
  videoBoxingUrl: string;
  createdAt: string;
  updatedAt: string;
};

export async function getOrders() {
  const { data } = await api.get<OrderRecord[]>("/orders");
  return data;
}

export async function getOrder(orderCode: string) {
  const { data } = await api.get<OrderRecord>(
    `/orders/${encodeURIComponent(orderCode)}`,
  );
  return data;
}

export async function updateOrder(orderCode: string, payload: FormData) {
  const { data } = await api.patch<OrderRecord>(
    `/orders/${encodeURIComponent(orderCode)}`,
    payload,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function uploadReturnVideo(payload: ReturnVideoPayload) {
  const { data } = await api.post<ReturnVideoResponse>(
    "/orders/check-return",
    payload,
  );
  return data;
}

export async function createOrder(payload: FormData) {
  const { data } = await api.post<{
    orderCode: string;
    videoBoxingUrl: string;
  }>("/orders", payload, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function confirmOrder(
  orderCode: string,
  issueDescription: string,
) {
  const { data } = await api.post<{ confirmed: boolean; orderCode: string }>(
    `/orders/${encodeURIComponent(orderCode)}/confirmation`,
    { confirmed: true, issueDescription },
  );
  return data;
}

export async function sendChatMessage(message: string) {
  const { data } = await api.post<{ answer?: string }>("/chat", { message });
  return data;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const responseData: unknown = error.response?.data;
    if (responseData && typeof responseData === "object") {
      const body = responseData as { message?: unknown; error?: unknown };
      if (typeof body.message === "string") return body.message;
      if (typeof body.error === "string") return body.error;
    }
    return error.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
}
