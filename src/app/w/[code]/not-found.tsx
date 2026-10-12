import { InactiveWish } from "@/components/wish/GrownupWish";

/** Unknown, mistyped or expired codes: a friendly page, never an error. */
export default function WishNotFound() {
  return <InactiveWish />;
}
