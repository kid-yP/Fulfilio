// Mirrors api/prisma/schema.prisma. Kept hand-in-sync rather than generated,
// since the client doesn't have access to the API's Prisma client.

export type Role = "OWNER" | "MANAGER" | "STAFF";

export type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "PROCESSING"
  | "FULFILLING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED"
  | "FAILED";

export const ORDER_PIPELINE_STAGES: OrderStatus[] = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "FULFILLING",
  "SHIPPED",
  "DELIVERED",
];

export const ORDER_TERMINAL_STATES: OrderStatus[] = [
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "FAILED",
];

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  myRole?: Role;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: Role;
  createdAt: string;
  user?: User;
}

export interface Product {
  id: string;
  workspaceId: string;
  name: string;
  sku: string;
  description: string | null;
  category: string | null;
  price: string; // Decimal serializes as string over JSON
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  inventory?: Inventory | null;
}

export interface Inventory {
  id: string;
  productId: string;
  quantity: number;
  reserved: number;
  lowStockThreshold: number;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  product?: Product;
}

export interface Order {
  id: string;
  workspaceId: string;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  subtotal: string;
  total: string;
  assignedToId: string | null;
  idempotencyKey?: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
  payment?: Payment | null;
}

export interface Payment {
  id: string;
  orderId: string;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  status: string;
  amount: string;
  currency: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DailySummaryStats {
  ordersCreatedToday: number;
  statusCounts: Record<string, number>;
  lowStockCount: number;
  lowStockProducts: Array<{
    id: string;
    name: string;
    available: number;
    lowStockThreshold: number;
  }>;
  failedPaymentsToday: number;
  deliveredToday: number;
  avgFulfillmentMinutes: number | null;
}

export interface DailySummary {
  stats: DailySummaryStats;
  summary: string;
  generatedBy: "ai" | "template";
}

export interface TriageResult {
  recommendations: Array<{ orderId: string; reason: string }>;
  generatedBy: "ai" | "template";
}

// Realtime event payload shapes (see api/src/realtime/socket.ts).
export interface OrderStatusChangedEvent {
  orderId: string;
  status: OrderStatus;
}

export interface OrderCreatedEvent {
  orderId: string;
  status: OrderStatus;
}

export interface OrderAssignedEvent {
  orderId: string;
  assignedToId: string;
}

export interface PresenceSnapshotEvent {
  onlineCount: number;
}

export interface PresenceOnlineEvent {
  userId: string;
}

export interface LowStockEvent {
  productId: string;
  quantity: number;
  lowStockThreshold: number;
}