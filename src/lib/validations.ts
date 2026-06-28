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

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type JoinEventInput = z.infer<typeof joinEventSchema>;
