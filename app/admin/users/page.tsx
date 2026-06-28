import { Badge } from "@/components/ui/badge";
import { AdminDeleteButton } from "@/components/admin-delete-button";

// 더미 사용자 데이터 (10명, 아바타 포함)
const users = [
  {
    id: "1",
    name: "김민준",
    email: "김민준@gather.com",
    role: "user",
    joinedAt: "2025-09-14",
    createdEvents: 4,
    joinedEvents: 4,
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=minjun",
  },
  {
    id: "2",
    name: "이서연",
    email: "이서연@gather.com",
    role: "user",
    joinedAt: "2025-09-16",
    createdEvents: 4,
    joinedEvents: 6,
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=seoyeon",
  },
  {
    id: "3",
    name: "박준서",
    email: "박준서@gather.com",
    role: "user",
    joinedAt: "2025-09-19",
    createdEvents: 4,
    joinedEvents: 7,
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=junseo",
  },
  {
    id: "4",
    name: "최지우",
    email: "최지우@gather.com",
    role: "user",
    joinedAt: "2025-09-22",
    createdEvents: 4,
    joinedEvents: 1,
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=jiwoo",
  },
  {
    id: "5",
    name: "정수아",
    email: "정수아@gather.com",
    role: "user",
    joinedAt: "2025-09-24",
    createdEvents: 4,
    joinedEvents: 7,
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=sua",
  },
  {
    id: "6",
    name: "강하윤",
    email: "강하윤@gather.com",
    role: "user",
    joinedAt: "2025-09-26",
    createdEvents: 0,
    joinedEvents: 4,
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=hayun",
  },
  {
    id: "7",
    name: "윤도현",
    email: "윤도현@gather.com",
    role: "user",
    joinedAt: "2025-09-29",
    createdEvents: 0,
    joinedEvents: 0,
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=dohyun",
  },
  {
    id: "8",
    name: "임지민",
    email: "임지민@gather.com",
    role: "user",
    joinedAt: "2025-10-02",
    createdEvents: 0,
    joinedEvents: 0,
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=jimin",
  },
  {
    id: "9",
    name: "한예준",
    email: "한예준@gather.com",
    role: "user",
    joinedAt: "2025-10-04",
    createdEvents: 0,
    joinedEvents: 4,
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=yejun",
  },
  {
    id: "10",
    name: "오서준",
    email: "오서준@gather.com",
    role: "user",
    joinedAt: "2025-10-07",
    createdEvents: 0,
    joinedEvents: 3,
    avatar: "https://api.dicebear.com/7.x/personas/svg?seed=seojun",
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
              <th className="px-4 py-3 text-left font-semibold">사용자</th>
              <th className="px-4 py-3 text-left font-semibold">이메일</th>
              <th className="px-4 py-3 text-left font-semibold">권한</th>
              <th className="px-4 py-3 text-left font-semibold">가입일</th>
              <th className="px-4 py-3 text-center font-semibold">
                생성 이벤트
              </th>
              <th className="px-4 py-3 text-center font-semibold">
                참여 이벤트
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
                {/* 아바타 + 이름 */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                    <span className="font-medium">{user.name}</span>
                  </div>
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  {user.role === "admin" ? (
                    <Badge className="bg-brand hover:bg-brand/80 border-transparent text-white">
                      관리자
                    </Badge>
                  ) : (
                    <Badge variant="secondary">일반</Badge>
                  )}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {user.joinedAt}
                </td>
                <td className="px-4 py-3 text-center font-medium">
                  {user.createdEvents}
                </td>
                <td className="px-4 py-3 text-center font-medium">
                  {user.joinedEvents}
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
