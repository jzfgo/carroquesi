import mascotUrl from "../assets/mascot.png";

interface Props {
  size?: number;
}

export function Mascot({ size = 160 }: Props) {
  return (
    <img
      src={mascotUrl}
      alt="Mascota de CarroQueSí"
      width={size}
      height={size}
      style={{ objectFit: "contain" }}
    />
  );
}
