// Set up telemetry/tracer
import "jsr:@cloudydeno/opentelemetry@0.10.2/register";

import { Meteor } from '../_meteor-compat/server/apis/meteor.ts';
import { Mongo } from '../_meteor-compat/server/apis/mongo.ts';
import { check } from '../_meteor-compat/server/apis/check.ts';

const Projects = new Mongo.Collection('Projects');
const Tasks = new Mongo.Collection('Tasks');

Meteor.publish('Chores', () => Projects.find({}))
Meteor.publish('AllData', () => [
  Projects.find({}),
  Tasks.find({}),
]);

Meteor.methods({
  async 'create-project'(title: unknown) {
    check(title, String);
    return await Projects.insertAsync({
      title,
      createdAt: new Date,
    });
  },
  async 'create-task'(projectId: unknown, title: unknown) {
    check(projectId, String);
    check(title, String);
    return await Tasks.insertAsync({
      projectId,
      title,
      createdAt: new Date,
    });
  },
});

// Start up the app server
// import "https://uber.danopia.net/dist-app-deno/affe913e555847a6c93dc173808fbaf19ae9e90c/hack/meteor-server/run.ts";
// import './serve.ts';
