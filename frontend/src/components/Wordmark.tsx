import "./Wordmark.css";

interface WordmarkProps {
  size?: number;
}

export function Wordmark({ size = 32 }: WordmarkProps) {
  const tickSize = Math.round(size * 0.55);
  return (
    <span
      className="wordmark"
      style={{ fontSize: size }}
      aria-label="CarroQueSí"
    >
      <span className="wordmark__word">Carro</span>
      <span className="wordmark__word">Que</span>
      <span className="wordmark__word">Sí</span>
      <svg
        className="wordmark__tick"
        width={tickSize}
        height={tickSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12 l5 5 L20 6" />
      </svg>
    </span>
  );
}
