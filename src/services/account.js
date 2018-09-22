
export default class AccountService {
    constructor(service_root, session, qsparams, response) {
        this.session = session;
        this.qsparams = qsparams;
        this.service_root = service_root;
        this.devices = [];

        this.account_endpoint = this.service_root + '/setup/web/device';
        this.account_devices_url = this.account_endpoint + '/getDevices';

        this.response = response;
    }

    static async getAccountService(service, service_root) {
        const account_endpoint = service_root + '/setup/web/device';
        const account_devices_url = account_endpoint + '/getDevices';

        const response = await service.session.get(account_devices_url, service.qsparams);

        return new AccountService(service_root, service.session, service.qsparams, response);
    }
}

// eslint-disable-next-line no-unused-vars
class AccountDevice {
    constructor(device_info) {
        this.device_info = device_info;
    }
}
