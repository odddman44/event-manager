import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { AdminDeleteButton } from "@/components/admin-delete-button";
import { createClient } from "@/lib/supabase/server";
import { listAllUsers } from "@/src/services/admin-service";
import { deleteUserAction } from "@/src/controllers/admin-controller";

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
}

async function AdminUsersContent() {
  const supabase = await createClient();
  const users = await listAllUsers(supabase);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">사용자 관리</h1>
        <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-sm">
          총 {users.length}명
        </span>
      </div>

      {/* 사용자 테이블 */}
      {users.length === 0 ? (
        <div className="rounded-card border border-dashed py-16 text-center">
          <p className="text-muted-foreground text-sm">
            가입한 사용자가 없습니다.
          </p>
        </div>
      ) : (
        <div className="rounded-card bg-card overflow-hidden border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="px-4 py-3 text-left font-semibold">사용자</th>
                <th className="px-4 py-3 text-left font-semibold">이메일</th>
                <th className="px-4 py-3 text-left font-semibold">권한</th>
                <th className="px-4 py-3 text-left font-semibold">가입일</th>
                <th className="px-4 py-3 text-center font-semibold">
                  생성 이벤트
                </th>
                <th className="px-4 py-3 text-center font-semibold">삭제</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-muted/20 border-b transition-colors last:border-0"
                >
                  <td className="px-4 py-3 font-medium">
                    {user.full_name ?? "이름 없음"}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    {user.role === "admin" ? (
                      <Badge className="bg-primary hover:bg-primary/80 border-transparent text-white">
                        관리자
                      </Badge>
                    ) : (
                      <Badge variant="secondary">일반</Badge>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-4 py-3 text-center font-medium">
                    {user.created_events_count}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <AdminDeleteButton
                      label={user.full_name ?? user.email}
                      onDelete={deleteUserAction.bind(null, user.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense>
      <AdminUsersContent />
    </Suspense>
  );
}
