export const AdminIconButton = ({
  setShowSettings,
  showSettings,
}: {
  setShowSettings: (value: boolean) => void;
  showSettings: boolean;
}) => {
  return (
    <button
      className="absolute top-2 right-2 width-10 height-10 mm-text-white bg-transparent text-3xl border-transparent"
      onClick={() => setShowSettings(showSettings)}
    >
      {showSettings ? "＜" : "⚙"}
    </button>
  );
};

export default AdminIconButton;
