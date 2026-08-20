export function BrandMark({
  size = "md",
  withWord = true,
}: {
  size?: "sm" | "md" | "lg";
  withWord?: boolean;
}) {
  const icon =
    size === "lg" ? "/brand/baltan-icon-128.png" : size === "sm" ? "/brand/baltan-icon-64.png" : "/brand/baltan-icon-64.png";
  return (
    <span className={`brand-mark brand-mark-${size}`}>
      <img className="brand-icon" src={icon} alt="" width={size === "lg" ? 40 : 32} height={size === "lg" ? 40 : 32} />
      {withWord ? <span className="brand-word">baltan</span> : null}
    </span>
  );
}
