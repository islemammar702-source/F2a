"use client";

import { CtaBand, PageHero, PROJECTS, ProjectCard } from "@/components/PublicSite";
import { useI18n } from "@/lib/i18n";

export default function ProjectsPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHero title={t("public.projectsTitle")} text={t("public.projectsText")} />
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {PROJECTS.map((p) => <ProjectCard key={p.key} p={p} />)}
      </section>
      <CtaBand />
    </>
  );
}
