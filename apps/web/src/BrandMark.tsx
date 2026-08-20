export function BrandMark({
  size = "md",
  withWord = true,
  sub,
}: {
  size?: "sm" | "md" | "lg";
  withWord?: boolean;
  sub?: string;
}) {
  const px = size === "lg" ? 40 : 32;
  const icon = size === "lg" ? "/brand/baltan-icon-128.png" : "/brand/baltan-icon-64.png";
  return (
    <span className={`brand-mark brand-mark-${size}`}>
      <img className="brand-icon" src={icon} alt="" width={px} height={px} />
      {withWord ? (
        <span className="brand-text">
          <span className="brand-word">baltan</span>
          {sub ? <span className="brand-sub">{sub}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
