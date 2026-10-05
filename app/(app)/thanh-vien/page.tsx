import { setMember, updateMyName } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { getProfiles, requireMe } from "@/lib/data";
import { fmtDate } from "@/lib/time";

export default async function MembersPage() {
  const [me, members] = await Promise.all([requireMe(), getProfiles()]);
  const waiting = members.filter((m) => !m.active);

  return (
    <>
      <ActionForm action={updateMyName} className="box">
        <h3>Tên của bạn</h3>
        <div className="row">
          <input type="text" name="full_name" required maxLength={160} defaultValue={me.full_name} style={{ flex: "1 1 220px" }} />
          <button className="btn" type="submit">
            Lưu tên
          </button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Đăng nhập bằng {me.email}. Vai trò: {me.role === "boss" ? "Sếp" : "Nhân viên"}
          {me.is_admin ? ", quản trị" : ""}.
        </p>
      </ActionForm>

      {me.is_admin && waiting.length > 0 && (
        <div className="notice warn">
          <div>
            <b>{waiting.length} người đang chờ kích hoạt.</b> Chọn vai trò, đặt “Được dùng”, rồi bấm Lưu.
          </div>
        </div>
      )}

      <section className="sec">
        <div className="sec-h">
          <h2>
            Thành viên <span className="cnt mono">{members.length}</span>
          </h2>
        </div>
        {!me.is_admin && (
          <p className="muted" style={{ margin: 0 }}>
            Chỉ quản trị mới phân quyền được. Người đăng ký đầu tiên là quản trị.
          </p>
        )}
        <div className="list">
          {members.map((m) => (
            <div className="box" key={m.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <b>{m.full_name || m.email}</b>
                  {m.id === me.id && <span className="muted"> (bạn)</span>}
                  <div className="muted" style={{ fontSize: 13 }}>
                    {m.email} · tham gia {fmtDate(m.created_at)}
                    {m.is_admin ? " · quản trị" : ""}
                  </div>
                </div>
                {!me.is_admin && (
                  <span className={`role${m.role === "boss" ? " boss" : ""}`}>
                    {m.active ? (m.role === "boss" ? "Sếp" : "Nhân viên") : "Chờ kích hoạt"}
                  </span>
                )}
              </div>
              {me.is_admin && (
                <ActionForm action={setMember} className="row">
                  <input type="hidden" name="id" value={m.id} />
                  <label className="f" style={{ flex: "1 1 140px" }}>
                    Vai trò
                    <select name="role" defaultValue={m.role}>
                      <option value="employee">Nhân viên</option>
                      <option value="boss">Sếp (được duyệt)</option>
                    </select>
                  </label>
                  <label className="f" style={{ flex: "1 1 140px" }}>
                    Trạng thái
                    <select name="active" defaultValue={m.active ? "1" : "0"} disabled={m.id === me.id}>
                      <option value="1">Được dùng</option>
                      <option value="0">Khoá / chờ kích hoạt</option>
                    </select>
                    {m.id === me.id && <input type="hidden" name="active" value="1" />}
                  </label>
                  <button className="btn primary" type="submit" style={{ alignSelf: "flex-end" }}>
                    Lưu
                  </button>
                </ActionForm>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
