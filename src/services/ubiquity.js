
export default class UbiquityService {
    constructor(service_root, session, qsparams) {
        this.session = session;
        this.qsparams = qsparams;
        this.service_root = service_root;
    }

    static getUbiquityService(service, service_root) {
        return new UbiquityService(service_root, service.session, service.qsparams);
    }

    getNodeUrl(id, variant = 'item') {
        return `${this.service_root}/ws/${this.qsparams.dsid}/${variant}/${id}`;
    }

    async getNode(id) {
        const response = await this.session.get(this.getNodeUrl(id));

        return new UbiquityNode(this, response);
    }

    async getChildren(id) {
        const response = await this.session.get(this.getNodeUrl(id, 'parent'));

        const items = response.item_list;

        return items.map(i => new UbiquityNode(this, item));
    }

    async getFile(id, ...args) {
        const response = await this.session.get(this.getNodeUrl(id, 'file'));

        return response;
    }

    get root() {
        return this._root || (this._root = this.getNode(0));
    }
}

class UbiquityNode {
    constructor(connection, data) {
        this.connection = connection;
        this.data = data;
    }

    get item_id() {
        return this.data.item_id;
    }

    get name() {
        return this.data.name;
    }

    get type() {
        return this.data.type;
    }

    getChildren() {
        return this.connection.getChildren(this.item_id);
    }

    get size() {
        // return parseInt(this.data.size);
        return this.data.size;
    }

    get modified() {
        return this.data.modified;
    }

    async dir() {
        return (await this.getChildren()).map(child => child.name);
    }

    async get(name) {
        return (await this.getChildren()).find(child => child.name === name);
    }
}
