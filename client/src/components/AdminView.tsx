/**
 * Placeholder — the real Monster Mash Admin Settings surface (weekly-voting
 * toggle, reset-leaderboard, delete-monster confirms) ships in Epic 8/9.
 * Kept minimal so `PageContainer` (protected) can still import it.
 */
export const AdminView = () => {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h3 className="h3">Admin Settings</h3>
      <p className="p2">The Monster Mash admin surface arrives with the awards + trophy epics.</p>
    </div>
  );
};

export default AdminView;
