import type { Project } from "./domain";

export interface ProjectRepository {
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  saveProject(project: Project): Promise<void>;
}

export class LocalProjectRepository implements ProjectRepository {
  private readonly indexKey = "demo-slides:project-index";
  private readonly activeKey = "demo-slides:active-project";
  private projectKey(id: string) { return `demo-slides:project:${id}`; }

  private readProject(raw: string | null) {
    if (!raw) return null;
    try { return JSON.parse(raw) as Project; } catch { return null; }
  }

  private readIndex() {
    try {
      const value = JSON.parse(localStorage.getItem(this.indexKey) ?? "[]");
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
    } catch { return []; }
  }

  async getProject(id: string) {
    const resolvedId = id === "current" ? localStorage.getItem(this.activeKey) : id;
    const stored = resolvedId ? this.readProject(localStorage.getItem(this.projectKey(resolvedId))) : null;
    return stored ?? (id === "current" ? this.readProject(localStorage.getItem("demo-slides:current")) : null);
  }

  async listProjects() {
    const indexed = this.readIndex().map((id) => this.readProject(localStorage.getItem(this.projectKey(id)))).filter((project): project is Project => Boolean(project));
    if (indexed.length) return indexed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const legacy = this.readProject(localStorage.getItem("demo-slides:current"));
    if (!legacy) return [];
    await this.saveProject(legacy);
    return [legacy];
  }

  async saveProject(project: Project) {
    localStorage.setItem(this.projectKey(project.id), JSON.stringify(project));
    const ids = [project.id, ...this.readIndex().filter((id) => id !== project.id)];
    localStorage.setItem(this.indexKey, JSON.stringify(ids));
    localStorage.setItem(this.activeKey, project.id);
  }
}
