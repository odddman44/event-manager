"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// 이벤트 생성 폼 상태 타입
interface EventFormState {
  title: string;
  datetime: string;
  location: string;
  maxParticipants: string;
  description: string;
}

export default function EventForm() {
  const [form, setForm] = useState<EventFormState>({
    title: "",
    datetime: "",
    location: "",
    maxParticipants: "",
    description: "",
  });

  // 폼 필드 변경 핸들러
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // 폼 제출 핸들러 (더미 — Phase 2)
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    alert("이벤트 생성 기능은 준비 중입니다.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 이벤트 제목 (필수) */}
      <div className="space-y-1.5">
        <Label htmlFor="title">
          이벤트 제목 <span className="text-primary">*</span>
        </Label>
        <Input
          id="title"
          name="title"
          placeholder="예: 개발자 밋업"
          value={form.title}
          onChange={handleChange}
          required
        />
      </div>

      {/* 날짜 및 시간 (필수) */}
      <div className="space-y-1.5">
        <Label htmlFor="datetime">
          날짜 및 시간 <span className="text-primary">*</span>
        </Label>
        <Input
          id="datetime"
          name="datetime"
          type="datetime-local"
          value={form.datetime}
          onChange={handleChange}
          required
        />
      </div>

      {/* 장소 (선택) */}
      <div className="space-y-1.5">
        <Label htmlFor="location">장소</Label>
        <Input
          id="location"
          name="location"
          placeholder="예: 서울 강남구 COEX (선택)"
          value={form.location}
          onChange={handleChange}
        />
      </div>

      {/* 최대 참여자 수 (선택) */}
      <div className="space-y-1.5">
        <Label htmlFor="maxParticipants">최대 참여자 수</Label>
        <Input
          id="maxParticipants"
          name="maxParticipants"
          type="number"
          min="1"
          placeholder="제한 없음"
          value={form.maxParticipants}
          onChange={handleChange}
        />
      </div>

      {/* 이벤트 설명 (선택, max 500자) */}
      <div className="space-y-1.5">
        <Label htmlFor="description">이벤트 설명</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="이벤트에 대해 간단히 소개해주세요."
          maxLength={500}
          rows={4}
          value={form.description}
          onChange={handleChange}
        />
        <p className="text-muted-foreground text-right text-xs">
          {form.description.length} / 500자
        </p>
      </div>

      {/* 버튼 영역 */}
      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          className="bg-primary hover:bg-primary/90 flex-1 text-white"
        >
          이벤트 만들기
        </Button>
        <Button type="button" variant="outline" className="flex-1" asChild>
          <Link href="/dashboard">취소</Link>
        </Button>
      </div>
    </form>
  );
}
