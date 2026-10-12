import { environmentalReport } from "../environment";
import type { CustomerOrderView } from "./service";

export function computeEnvironmental(view: CustomerOrderView) {
  return environmentalReport(view.order.frozen_bom, view.order.environmental_label as "new" | "reused" | "mixed");
}
