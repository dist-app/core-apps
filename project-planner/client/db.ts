import { server } from "../_meteor-compat/client/app";

export type Project = {
  _id: string;
  title: string;
  createdAt: Date;
  description?: string;
};
export const ProjectsCollection = server.getCollection<Project>('Projects');

export type Task = {
  _id: string;
  projectId: string;
  parentTaskId?: string;
  title: string;
  createdAt: Date;
  startedAt?: Date;
  doneAt?: Date;
  description?: string;
};
export const TasksCollection = server.getCollection<Task>('Tasks');
