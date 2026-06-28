import { Badge } from "@/components/ui/badge";
import { AdminDeleteButton } from "@/components/admin-delete-button";

// 더미 사용자 데이터
const users = [
  {
    id: "1",
    name: "김관리",
    email: "admin@example.com",
    role: "admin",
    created: "2026-01-01",
  },
  {
    id: "2",
    name: "이주최",
    email: "host1@example.com",
    role: "user",
    created: "2026-03-15",
  },
  {
    id: "3",
    name: "박이벤",
    email: "host2@example.com",
    role: "user",
    created: "2026-04-20",
  },
  {
    id: "4",
    name: "최스터",
    email: "host3@example.com",
    role: "user",
    created: "2026-05-10",
  },
];

export default function AdminUsersPage() {
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
      <div className="rounded-card bg-card overflow-hidden border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b">
              <th className="px-4 py-3 text-left font-semibold">이름</th>
              <th className="px-4 py-3 text-left font-semibold">이메일</th>
              <th className="px-4 py-3 text-left font-semibold">역할</th>
              <th className="px-4 py-3 text-left font-semibold">가입일</th>
              <th className="px-4 py-3 text-center font-semibold">삭제</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="hover:bg-muted/20 border-b transition-colors last:border-0"
              >
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="text-muted-foreground px-4 py-3">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  {user.role === "admin" ? (
                    // 관리자 역할: 브랜드 색상 뱃지
                    <Badge className="bg-brand hover:bg-brand/80 border-transparent text-white">
                      관리자
                    </Badge>
                  ) : (
                    // 일반 사용자 역할: 회색 뱃지
                    <Badge variant="secondary">일반</Badge>
                  )}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {user.created}
                </td>
                <td className="px-4 py-3 text-center">
                  <AdminDeleteButton label={user.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
