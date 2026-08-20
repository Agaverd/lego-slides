import type { Project } from "./domain";

export interface ProjectRepository {
  getProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
}

export class LocalProjectRepository implements ProjectRepository {
  async getProject(id: string) {
    const raw = localStorage.getItem(`demo-slides:${id}`) ?? localStorage.getItem("demo-slides:current");
    return raw ? JSON.parse(raw) as Project : null;
  }
  async saveProject(project: Project) {
    const raw = JSON.stringify(project);
    localStorage.setItem(`demo-slides:${project.id}`, raw);
    localStorage.setItem("demo-slides:current", raw);
  }
}
