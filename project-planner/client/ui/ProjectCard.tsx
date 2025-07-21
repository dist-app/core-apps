import { useFind } from '../../_meteor-compat/client/apis/react';
import { server } from '../../_meteor-compat/client/app';
import { Project, TasksCollection } from '../db';

export function ProjectCard(props: {
  project: Project;
}) {
  const tasks = useFind(() => TasksCollection.find({
    projectId: props.project._id,
  }), []);

  return (
    <div className="card">
      <div>Project: <strong>{props.project.title}</strong></div>
      <ul style={{textAlign: 'left'}}>
        {tasks.map(task => (
          <li key={task._id}>{task.title}</li>
        ))}
      </ul>
      <button onClick={() => server.callMethod('create-task', [props.project._id, prompt('Task name:')])}>
        + Task!!
      </button>
    </div>
  );
}
