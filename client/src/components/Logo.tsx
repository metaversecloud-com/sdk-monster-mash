interface LogoProps {
  className?: string;
}

export const Logo = ({ className = "h-8 w-auto" }: LogoProps) => {
  return <img src="/assets/logo.png" alt="Monster Mash" className={className} />;
};

export default Logo;
