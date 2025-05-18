import './App.css'

import { Project, ProjectsCollection } from './db'
import { server } from '../_meteor-compat/client/app'
import { useSubscribe, useFind } from '../_meteor-compat/client/apis/react';
import { ProjectCard } from './ui/ProjectCard';

export function App() {
  const isReady = useSubscribe('AllData');
  const projects = useFind(() => ProjectsCollection.find(), []);

  console.log('App render:', isReady, projects.length);
  if (!isReady) return (
    <h3>Loading...</h3>
  );

  return (
    <>
      <h1>Project Planner</h1>
      {projects.map(project => (
        <ProjectCard key={project._id} project={project}  />
      ))}
      <div className="card">
        <button onClick={() => server.callMethod('create-project', [prompt('Project name:')])}>
          Create project
        </button>
      </div>
    </>
  )
}
