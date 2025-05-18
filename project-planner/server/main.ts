// Set up telemetry/tracer
import "jsr:@cloudydeno/opentelemetry@0.10.2/register";

import { Meteor } from 'https://uber.danopia.net/dist-app-deno/b3c1c6a560a2624cd89e288910b39d48e99d1806/hack/meteor-server/interface/meteor-meteor.ts';
import { Mongo } from 'https://uber.danopia.net/dist-app-deno/b3c1c6a560a2624cd89e288910b39d48e99d1806/hack/meteor-server/interface/meteor-mongo.ts';
import { check } from 'https://uber.danopia.net/dist-app-deno/b3c1c6a560a2624cd89e288910b39d48e99d1806/hack/meteor-server/interface/meteor-check.ts';

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
// import "https://uber.danopia.net/dist-app-deno/b3c1c6a560a2624cd89e288910b39d48e99d1806/hack/meteor-server/run.ts";
import './serve.ts';
