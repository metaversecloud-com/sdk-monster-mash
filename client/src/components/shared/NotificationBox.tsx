import { ReactNode } from "react";

export const NotificationBox = ({
  header,
  text,
  children,
}: {
  header: string;
  text: string | ReactNode;
  children?: ReactNode;
}) => {
  return (
    <div className="w-fit grid gap-2 mt-2 p-4 px-8 rounded-2xl mm-border-2 mm-border-amber-dark mm-bg-amber flex-1 min-w-[280px] text-center mx-auto">
      <span
        aria-hidden="true"
        className="text-xl mm-text-amber-dark mm-border-2 mm-border-amber-dark rounded-full p-2 w-8 h-8 flex items-center justify-center mx-auto"
      >
        !
      </span>
      <h3>{header}</h3>
      <p className="text-sm mm-text-amber-dark">{text}</p>
      {children}
    </div>
  );
};

export default NotificationBox;
