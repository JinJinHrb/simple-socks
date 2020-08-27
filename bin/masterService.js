/* eslint-disable radix */
/* eslint-disable arrow-parens */
const cluster = require('cluster');
const _L = require('lodash');
const HTTP_SERVER_THREAD_ARR = [];
const NOT_LISTEN_THREAD_ARR = [];
let lastProcessIdx;
const initHandler = function (args = {}){
    const {
        cluster, numPrcs1, /* numPrcs2, */
        HTTP_SERVER_THREAD_ARR, 
        NOT_LISTEN_THREAD_ARR 
    } = args;
    if (cluster.isMaster) {
        lastProcessIdx = numPrcs1;
        for (let i = 0; i < numPrcs1; i++) {
            //轮询策略
            cluster.schedulingPolicy = cluster.SCHED_RR;
            const workThread = cluster.fork({ START_INDEX: 'START_INDEX' + i });
            HTTP_SERVER_THREAD_ARR.push(workThread);
        }
        /* for(let i=0; i < numPrcs2; i++){
            const workThread = cluster.fork({ NOT_LISTEN: 'NOT_LISTEN' + i });
            NOT_LISTEN_THREAD_ARR.push(workThread);
        } */
        cluster.on('exit', function (worker, code, signal) {
            const now = new Date();
            const diedPid = worker.process.pid;
            console.log(now, ': worker ' + diedPid + '; died, code:', code, '; signal:', signal);
            cluster.fork({ START_INDEX: 'START_INDEX' + (++lastProcessIdx) });
        });
        cluster.on('message', (worker, msg) => {
            if(!msg){
                return
            }
            if(msg instanceof Object){
                if(msg.NOT_LISTEN_THREAD_QUERY_PROCESS){ // 统一用流程行程
                    const threadLength = NOT_LISTEN_THREAD_ARR.length;
                    const randomIdx = Math.floor(Math.random() * threadLength);
                    NOT_LISTEN_THREAD_ARR[randomIdx].send(msg);
                }else if(msg.SOCKET_MSG){ // 对任一 HTTP 进程发送消息
                    /* for(let i=0; i<HTTP_SERVER_THREAD_ARR.length; i++){
                        HTTP_SERVER_THREAD_ARR[i].send(msg);
                    } */
                    const hstalength = HTTP_SERVER_THREAD_ARR.length;
                    const randomIdx = Math.floor(Math.random() * hstalength);
                    HTTP_SERVER_THREAD_ARR[randomIdx].send(msg);
                }else if(msg.THREAD_IDX){ // 进程间一对一通信
                    const idxArr = _L.trim(msg.THREAD_TARGET).split(',').map(a => parseInt(a));
                    for(let i=0; i<idxArr.length; i++){
                        const idx = idxArr[i];
                        HTTP_SERVER_THREAD_ARR[idx].send(msg);
                    }
                }else if(msg.MASTER_TASK === 'Y'){
                    //
                }else if(msg.logName){ // 日志都送到主进程对应程序处理
                    //
                }
            }
        });
    } else if(process.env.START_INDEX) {
        console.log('process.env.START_INDEX:', process.env.START_INDEX);
        require('./createRelayServer')
    }
}
// module.exports = initHandler;

/* 多进程 START */
const numPrcs1 = 3;
initHandler({
    cluster,
    HTTP_SERVER_THREAD_ARR,
    NOT_LISTEN_THREAD_ARR,
    numPrcs1
});
/* 多进程 END */
