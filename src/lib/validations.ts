import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().email("유효한 이메일을 입력해주세요"),
  password: z.string().min(6, "비밀번호는 최소 6자 이상이어야 합니다"),
});

export const signUpSchema = z.object({
  full_name: z
    .string()
    .min(2, "이름은 최소 2자 이상이어야 합니다")
    .max(50, "이름은 50자 이하여야 합니다"),
  email: z.string().email("유효한 이메일을 입력해주세요"),
  password: z.string().min(6, "비밀번호는 최소 6자 이상이어야 합니다"),
});

export const createEventSchema = z.object({
  title: z
    .string()
    .min(1, "이벤트 제목을 입력해주세요")
    .max(100, "제목은 100자 이하여야 합니다"),
  description: z.string().max(500, "설명은 500자 이하여야 합니다").optional(),
  event_date: z.string().min(1, "이벤트 날짜를 선택해주세요"),
  location: z.string().max(200, "장소는 200자 이하여야 합니다").optional(),
  max_participants: z
    .number()
    .int("정원은 정수여야 합니다")
    .positive("정원은 1명 이상이어야 합니다")
    .optional(),
});

export const joinEventSchema = z.object({
  name: z
    .string()
    .min(1, "이름을 입력해주세요")
    .max(50, "이름은 50자 이하여야 합니다"),
  memo: z.string().max(200, "메모는 200자 이하여야 합니다").optional(),
});

export const updateParticipantMemoSchema = z.object({
  memo: z.string().max(200, "메모는 200자 이하여야 합니다").optional(),
});

const MAX_COVER_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_COVER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// <input type="file">는 FileList를 다뤄 zodResolver와 궁합이 안 좋아 별도 함수로 분리
// (클라이언트 즉시 피드백 + 서버 재검증 양쪽에서 재사용)
export function validateCoverImage(file: File): string | null {
  if (!ALLOWED_COVER_IMAGE_TYPES.includes(file.type)) {
    return "JPG, PNG, WebP 형식의 이미지만 업로드할 수 있습니다.";
  }
  if (file.size > MAX_COVER_IMAGE_SIZE) {
    return "이미지 크기는 5MB 이하여야 합니다.";
  }
  return null;
}

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type JoinEventInput = z.infer<typeof joinEventSchema>;
export type UpdateParticipantMemoInput = z.infer<
  typeof updateParticipantMemoSchema
>;
