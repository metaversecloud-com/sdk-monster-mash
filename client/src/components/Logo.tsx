interface LogoProps {
  /** Extra classes for the <img> — defaults to a modal-header size. */
  className?: string;
}

/**
 * Monster Mash brand logo. Replaces all "Monster Mash" text sites so a
 * rebrand touches one file. Ships as a PNG so we don't invent a font
 * stack for the wordmark.
 */
export const Logo = ({ className = "h-8 w-auto" }: LogoProps) => {
  return <img src="/assets/logo.png" alt="Monster Mash" className={className} />;
};

export default Logo;
