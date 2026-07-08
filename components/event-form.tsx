"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createEventSchema,
  type CreateEventInput,
} from "@/src/lib/validations";
import { createEventAction } from "@/src/controllers/event-controller";

export default function EventForm() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateEventInput>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      title: "",
      description: "",
      event_date: "",
      location: "",
      max_participants: undefined,
    },
  });

  const description = watch("description") ?? "";

  async function onSubmit(data: CreateEventInput) {
    setServerError(null);
    const result = await createEventAction({
      ...data,
      // datetime-local 값은 타임존 정보가 없어 브라우저 로컬 시간대로 해석되므로 UTC ISO 문자열로 변환
      event_date: new Date(data.event_date).toISOString(),
    });
    if (result?.success === false) {
      setServerError(result.error);
    }
    // 성공 시 서버 액션 내부 redirect()가 네비게이션을 처리
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* 이벤트 제목 (필수) */}
      <div className="space-y-1.5">
        <Label htmlFor="title">
          이벤트 제목 <span className="text-primary">*</span>
        </Label>
        <Input
          id="title"
          placeholder="예: 개발자 밋업"
          {...register("title")}
        />
        {errors.title && (
          <p className="text-sm text-red-500">{errors.title.message}</p>
        )}
      </div>

      {/* 날짜 및 시간 (필수) */}
      <div className="space-y-1.5">
        <Label htmlFor="event_date">
          날짜 및 시간 <span className="text-primary">*</span>
        </Label>
        <Input
          id="event_date"
          type="datetime-local"
          {...register("event_date")}
        />
        {errors.event_date && (
          <p className="text-sm text-red-500">{errors.event_date.message}</p>
        )}
      </div>

      {/* 장소 (선택) */}
      <div className="space-y-1.5">
        <Label htmlFor="location">장소</Label>
        <Input
          id="location"
          placeholder="예: 서울 강남구 COEX (선택)"
          {...register("location")}
        />
        {errors.location && (
          <p className="text-sm text-red-500">{errors.location.message}</p>
        )}
      </div>

      {/* 최대 참여자 수 (선택) */}
      <div className="space-y-1.5">
        <Label htmlFor="max_participants">최대 참여자 수</Label>
        <Input
          id="max_participants"
          type="number"
          min="1"
          placeholder="제한 없음"
          {...register("max_participants", {
            setValueAs: (v) => (v === "" ? undefined : Number(v)),
          })}
        />
        {errors.max_participants && (
          <p className="text-sm text-red-500">
            {errors.max_participants.message}
          </p>
        )}
      </div>

      {/* 이벤트 설명 (선택, max 500자) */}
      <div className="space-y-1.5">
        <Label htmlFor="description">이벤트 설명</Label>
        <Textarea
          id="description"
          placeholder="이벤트에 대해 간단히 소개해주세요."
          maxLength={500}
          rows={4}
          {...register("description")}
        />
        <p className="text-muted-foreground text-right text-xs">
          {description.length} / 500자
        </p>
        {errors.description && (
          <p className="text-sm text-red-500">{errors.description.message}</p>
        )}
      </div>

      {/* 서버 에러 메시지 영역 */}
      {serverError && <p className="text-sm text-red-500">{serverError}</p>}

      {/* 버튼 영역 */}
      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary hover:bg-primary/90 flex-1 text-white"
        >
          {isSubmitting ? "생성 중..." : "이벤트 만들기"}
        </Button>
        <Button type="button" variant="outline" className="flex-1" asChild>
          <Link href="/dashboard">취소</Link>
        </Button>
      </div>
    </form>
  );
}
