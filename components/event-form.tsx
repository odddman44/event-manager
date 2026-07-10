"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createEventSchema,
  validateCoverImage,
  type CreateEventInput,
} from "@/src/lib/validations";
import {
  createEventAction,
  updateEventAction,
} from "@/src/controllers/event-controller";

interface EventFormDefaultValues {
  title: string;
  description: string;
  event_date: string; // ISO 문자열
  location: string;
  max_participants?: number;
}

interface EventFormProps {
  mode?: "create" | "edit";
  eventId?: string;
  defaultValues?: EventFormDefaultValues;
  existingCoverImageUrl?: string | null;
}

// datetime-local input은 값을 브라우저 로컬 타임존으로 해석하므로,
// 서비스 전역에서 KST로 고정 표시하는 기존 방식(formatDate들)과 일관되게
// ISO 문자열을 KST 기준 "YYYY-MM-DDTHH:mm"으로 변환해 프리필한다.
function toDatetimeLocalValue(isoString: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoString));

  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default function EventForm({
  mode = "create",
  eventId,
  defaultValues,
  existingCoverImageUrl,
}: EventFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImageError, setCoverImageError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    existingCoverImageUrl ?? null,
  );

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateEventInput>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      title: defaultValues?.title ?? "",
      description: defaultValues?.description ?? "",
      event_date: defaultValues?.event_date
        ? toDatetimeLocalValue(defaultValues.event_date)
        : "",
      location: defaultValues?.location ?? "",
      max_participants: defaultValues?.max_participants,
    },
  });

  const description = watch("description") ?? "";

  // 미리보기용 blob: URL은 컴포넌트가 언마운트되거나 새 파일로 교체될 때 해제
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleCoverImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const validationError = validateCoverImage(file);
    if (validationError) {
      setCoverImageError(validationError);
      return;
    }
    setCoverImageError(null);
    setCoverImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function onSubmit(data: CreateEventInput) {
    setServerError(null);
    const payload = {
      ...data,
      // datetime-local 값은 타임존 정보가 없어 브라우저 로컬 시간대로 해석되므로 UTC ISO 문자열로 변환
      event_date: new Date(data.event_date).toISOString(),
    };

    const result =
      mode === "edit" && eventId
        ? await updateEventAction(eventId, payload, coverImageFile ?? undefined)
        : await createEventAction(payload, coverImageFile ?? undefined);

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

      {/* 커버 이미지 (선택) */}
      <div className="space-y-1.5">
        <Label htmlFor="coverImage">커버 이미지</Label>
        {previewUrl && (
          <div className="bg-muted relative mb-2 h-32 w-full overflow-hidden rounded-md">
            <Image
              src={previewUrl}
              alt="커버 이미지 미리보기"
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        )}
        <Input
          id="coverImage"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleCoverImageChange}
        />
        <p className="text-muted-foreground text-xs">
          JPG, PNG, WebP / 최대 5MB
        </p>
        {coverImageError && (
          <p className="text-sm text-red-500">{coverImageError}</p>
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
          {isSubmitting
            ? mode === "edit"
              ? "수정 중..."
              : "생성 중..."
            : mode === "edit"
              ? "수정 완료"
              : "이벤트 만들기"}
        </Button>
        <Button type="button" variant="outline" className="flex-1" asChild>
          <Link
            href={
              mode === "edit" && eventId ? `/events/${eventId}` : "/dashboard"
            }
          >
            취소
          </Link>
        </Button>
      </div>
    </form>
  );
}
