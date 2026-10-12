import Link from "next/link";
import StartButton from "@/components/StartButton";
import "@/components/lab/lab.css";

/** Friendly dead end: no error codes, just a way back to inventing. */
export default function LabNotFound() {
  return (
    <div className="lab-lost">
      <span className="lab-lost-face" aria-hidden>
        🦕
      </span>
      <h1>This creature wandered off!</h1>
      <p>We can&apos;t find it on this device. Let&apos;s invent a new one.</p>
      <StartButton template="creature" to="lab" label="✨ Start inventing" variant="hero" />
      <Link href="/">Back to the start</Link>
    </div>
  );
}
