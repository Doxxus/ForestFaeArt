import type { Api } from "@/lib/api";

export type LabelItemDto = Awaited<ReturnType<Api["labels"]["prepare"]["query"]>>["items"][number];
export type TemplateDto = Awaited<ReturnType<Api["labels"]["templates"]["list"]["query"]>>[number];
export type LabelContextDto = Awaited<ReturnType<Api["labels"]["context"]["query"]>>;
