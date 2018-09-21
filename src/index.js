import path from 'path';

import request from 'request';
import requestPromise from 'request-promise-native';

import { AccountService, UbiquityService, DriveService } from './services';

import FileCookieStore from 'tough-cookie-filestore';

// NOTE - currently the 'cookies.json' file must already exist!
const cookies = request.jar(new FileCookieStore(path.resolve(__dirname, '..', 'cookies.json')));

export class iCloudSession {
    constructor(service) {
        this.service = service;
    }

    request(method, url, qs, data) {
        return requestPromise({
            url,
            qs,
            method,
            body: data,
            json: true,
            jar: cookies,
            headers: {
                'Origin': this.service.home_endpoint,
                'Referer': this.service.home_endpoint + '/',
                'User-Agent': 'Opera/9.52 (X11; Linux i686; U; en)'
            },
            strictSSL: false
        });
    }

    get(url, qsparams) {
        return this.request('GET', url, qsparams);
    }

    post(url, qsparams, data) {
        return this.request('POST', url, qsparams, data);
    }
}

export default class iCloudService {
    constructor(apple_id, password, options) {
        this.apple_id = apple_id;
        this.password = password;
        this.options = options;

        this.data = {};
        this.client_id = '0000-0000-0000-0000';
        this.user = {apple_id, password};

        this.home_endpoint = 'https://www.icloud.com';
        this.setup_endpoint = 'https://setup.icloud.com/setup/ws/1';

        this.base_login_url = this.setup_endpoint + '/login';

        this.session = new iCloudSession(this);

        this.session.verify = options && options.hasOwnProperty('verify') ? options.verify : true;

        this.qsparams = {
            clientBuildNumber: '17DHotfix5',
            clientMasteringNumber: '17DHotfix5',
            ckjsBuildVersion: '17DProjectDev77',
            ckjsVersion: '2.0.5',
            clientId: this.client_id
        };
    }

    /**
     * Handles authentication and persists the X-APPLE-WEB-KB cookie so that
     * subsequent logins will not cause additional emails from Apple.
     */
    async authenticate() {
        console.log('Authenticating as', this.user.apple_id);

        const data = {
            apple_id: this.apple_id,
            password: this.password,

            // We authenticate every time so remember me is not needed
            extended_login: false
        };

        const response = await this.session.post(this.base_login_url, this.qsparams, data);

        this.data = response;
        this.qsparams.dsid = response.dsInfo.dsid;

        console.log('Authenticated as', this.ds_info.fullName);

        return response;
    }

    get ds_info() {
        return this.data && this.data.dsInfo;
    }

    get webservices() {
        return this.data && this.data.webservices;
    }

    /**
     * Returns true if two step authentication is required.
     */
    get requires_2sa() {
        return this.data && this.data.hsaChallengeRequired;
    }

    /**
     * Returns devices trusted for two step authentication.
     *
     * @return Promise
     */
    getTrustedDevices() {
        return this.session.get(this.setup_endpoint + '/listDevices', this.qsparams);
    }

    /**
     * Requests that a verification code is sent to the given device.
     *
     * @return Promise
     */
    sendVerificationCode(device) {
        return this.session.post(this.setup_endpoint + '/sendVerificationCode', this.qsparams, device);
    }

    /**
     * Verifies a verification code received on a trusted device.
     *
     * @return Promise
     */
    validateVerificationCode(device, code) {
        return this.session.post(this.setup_endpoint + '/validateVerificationCode', this.qsparams, Object.assign({
            verificationCode: code,
            trustBrowser: true
        }, device));

        // Later make this reauthenticate
    }

    get account() {
        return this._account || (this._account = AccountService.getAccountService(this, this.webservices.account.url));
    }

    get ubiquity() {
        return this._ubiquity || (this._ubiquity = UbiquityService.getUbiquityService(this, this.webservices.ubiquity.url));
    }

    get files() {
        return this.ubiquity;
    }

    get drive() {
        return this._drive || (this._drive = DriveService.getDriveService(this, this.webservices.drivews.url));
    }
}
