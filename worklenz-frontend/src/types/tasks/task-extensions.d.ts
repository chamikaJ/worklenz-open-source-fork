import { ITaskViewModel } from './task.types';

declare module './task.types' {
  export interface ITaskViewModel {
    weight?: number;
  }
}
