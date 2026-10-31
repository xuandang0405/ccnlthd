import { Link } from "react-router-dom";
import { siteConfig } from "../config/site";

type BrandProps = { variant?: "full" | "icon" | "responsive" };

export function Brand({ variant = "full" }: BrandProps) {
  return (
    <Link to="/" className={`brand brand-${variant}`} aria-label={`${siteConfig.name} - Trang chủ`}>
      {variant === "responsive" ? (
        <picture>
          <source media="(max-width: 1023px)" srcSet={siteConfig.logoIcon} />
          <img className="brand-logo" src={siteConfig.logoFull} alt={siteConfig.name} width={1215} height={428} />
        </picture>
      ) : (
        <img className="brand-logo" src={variant === "icon" ? siteConfig.logoIcon : siteConfig.logoFull} alt={siteConfig.name} width={variant === "icon" ? 394 : 1215} height={variant === "icon" ? 422 : 428} />
      )}
    </Link>
  );
}
