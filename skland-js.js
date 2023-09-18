import plugin from '../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import lodash from 'lodash'

export class skland extends plugin {
    constructor () {
        super({
            name: '森空岛',
            dsc: '复森空',
            /** https://oicqjs.github.io/oicq/#events */
            event: 'message',
            priority: 5000,
            rule: [
                {
                    /** 命令正则匹配 */
                    reg: '^#森空岛登陆(.*)$',
                    /** 执行方法 */
                    fnc: 'sklandLogin'
                },
                {
                    /** 命令正则匹配 */
                    reg: '^#森空岛签到$',
                    /** 执行方法 */
                    fnc: 'sklandSign'
                }
            ]
        })
    }

    /** 签到 */
    async sklandSign () {
        /*获取信息*/
        let uid =await this.getskdCfg('skland.uid','');
        let gameId =await this.getskdCfg('skland.channelMasterId','');
        let credMsg =await this.getskdCfg('cred','');
        logger.info('uid为'+uid+'，gameId为'+gameId);
        logger.info(uid);
        logger.info(gameId);
        if (uid&&gameId){
            let signUrl = 'https://zonai.skland.com/api/v1/game/attendance'
            let data = JSON.stringify({
                uid: uid,
                gameId: gameId
            })
            try {
                let ret = await fetch(signUrl, {
                    method: 'POST', headers: {
                        'Cred': credMsg,
                        'Content-Type': 'application/json'
                    },
                    body: data
                })
                ret = await ret.json();
                logger.info(JSON.stringify(ret))
                let credCode = ret.code;
                if (credCode===0){
                    var awards = ret.data.awards;
                    const result = awards.map(award => `${award.count} ${award.resource.name}`).join(', ');
                    this.e.reply('签到成功，你获得'+result, false, { recallMsg: 0 })
                }else if(credCode) {
                    this.e.reply(ret.message, false, { recallMsg: 0 });
                }else {
                    this.e.reply('签到异常', false, { recallMsg: 0 });
                }
            }catch (e) {
                this.e.reply('签到异常', false, { recallMsg: 0 })
            }
        }else {
            this.e.reply('你的UID不存在，请重新登陆', false, { recallMsg: 0 })
        }
    }
    /* 获取森空岛用户配置 */
    async  getskdCfg (path, defaultValue) {
        let userCfg = await redis.get(`skland:user-cfg:${this.e.user_id}`);
        userCfg = userCfg ? JSON.parse(userCfg) : {};
        var value = lodash.get(userCfg, path, defaultValue);
        logger.info(value)
        return value;
    }
    // 保存森空岛用户配置
    async setskdCfg (path, value) {
        let userCfg = await redis.get(`skland:user-cfg:${this.e.user_id}`)
        userCfg = userCfg ? JSON.parse(userCfg) : {}
        lodash.set(userCfg, path, value)
        await redis.set(`skland:user-cfg:${this.e.user_id}`, JSON.stringify(userCfg))
    }
    /** 登陆 */
    async sklandLogin (e) {
        let tokenMsg =e.msg;
        let emsg = e.msg.replace(/#|＃|森空岛登陆/g, "");
        this.checkToken(emsg);
    }

    /**
     * 获取token，刷新数据
     */
    receiveToken () {
        //获取token字段
        let tokenMsg =this.e.msg;
        this.checkToken(tokenMsg);
        /** 结束上下文 */
        this.finish('receiveToken')
    }

    /**
     * 校验cred是否可用
     * @param credMsg
     * @returns {Promise<boolean>}
     */
    async checkCred (credMsg) {
        logger.info("开始校验cred是否可用"+credMsg)
        let checkUrl = 'https://zonai.skland.com/api/v1/user/check'
        try {
            let ret = await fetch(checkUrl, {
                method: 'GET', headers: {
                    'Cred': credMsg
                }
            })
            ret = await ret.json();
            logger.info(JSON.stringify(ret))
            var credCode = ret.code
            logger.info('credCode'+credCode)
            if (credCode===0){
                logger.info('校验成功，你的Cred值为'+credMsg)
                this.setskdCfg('cred',credMsg)
                this.matchUserMsg(credMsg)
            }else {
                this.e.reply('校验失败，你的Cred错误或已过期', false, { recallMsg: 0 });
            }
        }
        catch (error) {
            return false
        }
    }

    /**
     * 获取用户信息
     * @param credMsg
     * @returns {Promise<boolean>}
     */
    async matchUserMsg (credMsg) {
        logger.info('开始获取用户信息')
        let userUrl = 'https://zonai.skland.com/api/v1/game/player/binding'
        try {
            let ret = await fetch(userUrl, {
                method: 'GET', headers: {
                    'Cred': credMsg,
                }
            })
            ret = await ret.json();
            logger.info(JSON.stringify(ret))
            //过滤为arknights的数据
            let filteredData = ret.data.list;
            logger.info(filteredData);
            var bindingList = filteredData[0].bindingList;
            let arkMsg =bindingList[0];
            // 保存用户配置
            let userCfg = await redis.get(`skland:user-cfg:${this.e.user_id}`);
            userCfg = userCfg ? JSON.parse(userCfg) : {};
            logger.info( JSON.stringify(userCfg));
            lodash.set(userCfg, 'skland.uid', arkMsg.uid);
            lodash.set(userCfg, 'skland.channelName', arkMsg.channelName);
            lodash.set(userCfg, 'skland.channelMasterId', arkMsg.channelMasterId);
            lodash.set(userCfg, 'skland.nickName', arkMsg.nickName);
            logger.info('userCfg');
            logger.info( JSON.stringify(userCfg));
            await redis.set(`skland:user-cfg:${this.e.user_id}`, JSON.stringify(userCfg));
            this.e.reply('博士'+arkMsg.nickName+'登陆成功', false, { recallMsg: 0 })
        }
        catch (error) {
            return false
        }
    }
    /**
     * 校验token
     * @param tokenMsg
     * @returns {Promise<boolean>}
     */
    async checkToken (tokenMsg) {
        logger.info('开始校验token'+tokenMsg)
        /** e.msg 用户的命令消息 */
        let grant = 'https://as.hypergryph.com/user/oauth2/v2/grant'
        try {
            let param=JSON.stringify({
                appCode: '4ca99fa6b56cc2ba',
                token: tokenMsg,
                type: 0
            });
            let oAuth2Res = await fetch(grant, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: param
            })
            oAuth2Res = await oAuth2Res.json();
            logger.info(JSON.stringify(oAuth2Res));
            if (oAuth2Res.status===0){
                this.setskdCfg('token',tokenMsg)
                let userAuth2Code=oAuth2Res.data.code;
                this.matchCred(userAuth2Code);
            }else {
                this.e.reply('token错误', false, { recallMsg: 0 })
                return false
            }
        } catch (error) {
            this.e.reply('token异常，登陆失败', false, { recallMsg: 0 })
            return false
        }
    }

    /**
     * 通过Auth值获取用户Cred
     * @param userAuth2Code
     * @returns {Promise<boolean>}
     */
    async matchCred (userAuth2Code) {
        logger.info('开始通过Auth值获取用户Cred')
        /** e.msg 用户的命令消息 */
        let url = 'https://zonai.skland.com/api/v1/user/auth/generate_cred_by_code'
        try {
            let param=JSON.stringify({
                code: userAuth2Code,
                kind: 1
            });
            let credRes = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: param
            })
            credRes = await credRes.json();
            logger.info(JSON.stringify(credRes))
            let cred=credRes.data.cred;
            this.checkCred(cred);

        } catch (error) {
            this.e.reply('cred异常，登陆失败', false, { recallMsg: 0 })
            return false
        }
    }
}

