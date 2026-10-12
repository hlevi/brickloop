import type { Metadata } from "next";
import "./lab-shell.css";

export const metadata: Metadata = {
  title: "Creature Lab - BrickLoop",
  description: "Invent a creature, bring it to life, and show a grown-up.",
};

/** Kid mode: no grown-up navigation inside the Lab (see lab-shell.css). */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <div className="lab-shell">{children}</div>;
}
