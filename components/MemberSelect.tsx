export function MemberSelect({
  name,
  members,
  defaultValue,
}: {
  name: string;
  members: { id: string; full_name: string; email: string }[];
  defaultValue: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue}>
      <option value="">— Chưa chọn —</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.full_name || m.email}
        </option>
      ))}
    </select>
  );
}
