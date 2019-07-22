export class WorkflowStrategy {
    public name: string;
    public handler: any;

    constructor(name: string, handler: any) {
        this.name = name;
        this.handler = handler;
    }

}
