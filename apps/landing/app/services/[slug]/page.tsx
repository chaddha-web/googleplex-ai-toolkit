import { notFound } from "next/navigation";
import { SERVICES, getService } from "@/lib/services";
import { ServiceDetail } from "./service-detail";

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { slug: string } }) {
  const s = getService(params.slug);
  if (!s) return {};
  return {
    title: `${s.title} — GoogolPlex`,
    description: s.body
  };
}

export default function ServicePage({ params }: { params: { slug: string } }) {
  const service = getService(params.slug);
  if (!service) notFound();
  return <ServiceDetail service={service} />;
}
