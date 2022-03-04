//固定パラメータ
const NUM_LOOP = 1000;//シミュレーション施行回数
const INCOME = 30;//入金額
const YEARS = 1/3;
const PERIOD = 360 * YEARS;
const NUM_PERIODS = 3;//上下上など3段階で値が大きく動く
const REBALANCE_INTERVAL = 365;//リバランスを実施する間隔(単位は日)
const DO_REBALANCE = true;//リバランスするか？
const ICASH = 0;//assets[0]は必ず現金にする。
const FIRST_CHART_PRICE = 1;//変更不可!


const createPurchaseSam = () => {
    return {
        sellValues: 0,//sellの評価額(単価*口数)
        sellNums: 0,//sellの口数
        buyValues: 0,//buyの評価額(単価*口数)
        buyNums: 0,//buyの口数
    };
}
let PURCHASE_SUM = createPurchaseSam();

/**
 * シミュレーション用の株価を取得。
 * 
 * @param  {number} keikiHosei 騰落率の補正値(例不景気なら-0.1)
 * @param  {number} hoseiMagnification 補正倍率(逆相関にしたければマイナス値を指定)
 * @param  {number} upRate 騰落率の最大値(例:5%なら5)
 * @param  {number} avgDenominator 平均値を取る際の試行回数(少ないほど乱高下)
 
 * @return {number} 騰落率(例:-4%なら-4)
 */
const getUpdownRate = (keikiHosei, hoseiMagnification, updown, avgDenominator) => {
    //hoseiMagnificationが多いと景気の影響を強く受ける(マイナスだと逆相関)
    //updownが多いとボラティリティが高い。
    const hosei = keikiHosei * hoseiMagnification;
    const max = updown + hosei;
    const min = -updown + hosei;  
    
    //複数回試行して平均を取ることで値動きをマイルドにする。
    avgDenominator = Math.max(1, avgDenominator);
    let sum = 0;
    for (let i=0; i<avgDenominator; i++) {
        sum += Math.random() * (max - min) + min;
    }
    return (sum / avgDenominator);
}
/**
 * 相関係数を取得。
 * 
 * @param  {Array} xx 配列1
 * @param  {Array} yy 配列2
 * @return {number} 相関係数
 */
const sampleCorrelation = (xx, yy) => {
    let m = Math, n;
    if (xx.length == yy.length) {
        n = xx.length;
        let sumx=0, sumy=0, xm ,ym ,xxi ,yyi,sumxxm=0, sumyym=0, sumxym=0
        for(let i=0; i<n; i++){
            sumx += (xx[i]-0);
            sumy += (yy[i]-0);
        }
        xm = sumx/n;
        ym = sumy/n;
        for(let i=0; i<n; i++){
            xxi = (xx[i]-0);
            yyi = (yy[i]-0);
            sumxxm += (xxi-xm) * (xxi-xm);
            sumyym += (yyi-ym) * (yyi-ym);
            sumxym += (xxi-xm) * (yyi-ym);
        }
        return sumxym / m.sqrt(sumxxm) / m.sqrt(sumyym);
    } else {
        throw new Error("Array length is not same.");
    }
}

/**
 * 成長率を取得。
 * 
 * @param  {number} current 現在の数値
 * @param  {number} first 最初の数値
 * @return {number} 金利
 */
const getGrowthRate = (current, first) => {
    return Math.round((current - first) / first * 100);
}

/**
 * 単純な比率に応じて資産を分割する。
 * 
 * @param  {Array} assets assetオブジェクトの配列
 * @return {Array} 新しい配分の配列
 */
const divideAssets = (assets, dealAmount) => {
    const balances = [];
    assets.forEach((asset, i) => {
        balances[i] = dealAmount * asset.balance/10;
    });
    return balances;
}

/**
 * 時価総額ベースで資産を分割する。
 * 
 * @param  {Array} assets assetオブジェクトの配列
 * @return {Array} 新しい配分の配列
 */
 const rebalanceAssets = (assets) => {
     //資産を時価総額に変更。
    const values = assets.map((asset) => {
        return asset.amount * asset.lastChartPrice;
    })

    //全資産の時価総額を求める。
    let dealAmount = values.reduce((sum, val) => {
        return sum + val;
    });

    //時価総額で配分する。
    const newValues = divideAssets(assets, dealAmount);

    //新しい口数を求める。
    const newBalances = assets.map((asset, i) => {
        return newValues[i] / asset.lastChartPrice;
    });
    return newBalances;
}

/**
 * 桁数指定で四捨五入
 * 
 * @param  {Number} num 数値
 * @param  {Number} digit 桁数
 * @return {Number} 四捨五入した数
 */
const round = (num, digit=1) => {
    const digitVal = Math.pow(10, digit);
    return Math.round(num * digitVal) / digitVal;
}

/**
 * 資産配分を実行する。
 * 
 * @param  {Array} assets assetオブジェクトの配列
 * @return {Array} 売買履歴の配列。
 */
const rebalance = (assets) => {
    //時価総額ベースで資産配分する。
    const balances = rebalanceAssets(assets);

    //現金残高がマイナスでない場合は資産配分を実行する。
    const history = [];
    if (balances[ICASH] >= 0) {
        balances.forEach((bal, i) => {
            const diff = bal - assets[i].amount;//デバッグ用
            assets[i].amount = bal;
            //確認用
            if (diff > 0) {
                PURCHASE_SUM.buyValues += diff * assets[i].lastChartPrice;//口数*時価
                PURCHASE_SUM.buyNums += diff;//口数
            } else {
                PURCHASE_SUM.sellValues -= diff * assets[i].lastChartPrice;//口数*時価
                PURCHASE_SUM.sellNums -= diff;//口数
            }
            history.push(`${diff>0?'+':''}${round(diff)}|${round(assets[i].lastChartPrice)}*${round(assets[i].amount)}=${round(assets[i].lastChartPrice *　assets[i].amount)}`);
        });
    } else {
        console.log('現金不足でリバランスできません！')
    }
    return history;
}


/**
 * Assetオブジェクトの定義
 * 配列のうち最もupdownが低い(ゼロに近い)ものが安全資産扱いとなる
 * 
 * @param  {String} label assetオブジェクトの配列
 * @param  {Number} balance 資産配分の比率(9割なら9)
 * @param  {Number} updown その資産の日毎の騰落率の最大値(-5%なら-5)
 * @param  {Number} hoseiMagnification 補正倍率(景気と逆相関にするならマイナス値を指定)
 * @param  {Boolean} avgDenominator 多いほど値動きがマイルドになる
 * @return {Object} Assetオブジェクト
 */
const createAsset = (label, balance, updown=0, hoseiMagnification=10, avgDenominator=true) => {
    return {
        label: label,
        updown: updown,
        hoseiMagnification: hoseiMagnification,
        avgDenominator: avgDenominator,
        balance: balance,
        amount: 0,//口数(評価額でないことに注意!)
        firstChartPrice: FIRST_CHART_PRICE,
        lastChartPrice: FIRST_CHART_PRICE,
        chartPriceLogs: [],
    };
    //e(keikiHosei, asset.hoseiMagnification, asset.updown, asset.avgDenominator) 
}

const runShortSimulation = (assets, keikiHosei) => {
    for (let day=0; day<PERIOD; day++) {
        //各々の騰落率に応じて株価を毎日増減させる。
        assets.forEach((asset, i) => {
            const rate = getUpdownRate(keikiHosei, asset.hoseiMagnification, asset.updown, asset.avgDenominator) / 100 + 1;
            assets[i].lastChartPrice = assets[i].lastChartPrice * rate;
            assets[i].chartPriceLogs.push(assets[i].lastChartPrice);
        });
        assets[ICASH].lastChartPrice = FIRST_CHART_PRICE;//冗長だが一応

        //毎月の収入で比率に応じて資産を積み立てる。
        if (day % 30 === 0) {
            //収入を比率で分割。
            const divs = divideAssets(assets, INCOME);

            //時価総額に応じた口数に変更する。
            const nums = divs.map((div, i) => div / assets[i].lastChartPrice);

            //確認用
            nums.forEach((num, i) => {
                PURCHASE_SUM.buyValues += divs[i];//口数*時価
                PURCHASE_SUM.buyNums += num;//口数
            });

            //assetsに購入した口数を反映する。
            nums.forEach((num, i) => {
                assets[i].amount += num
            });
            if (NUM_LOOP === 1) {
                console.log(nums.map((n) => round(n)));
            }
        }

        //一定期間毎にリバランスを実行。
        if (day !== 0 && (day % REBALANCE_INTERVAL === 0 || day === PERIOD-1)) {
            if (DO_REBALANCE) {
                const history = rebalance(assets);
                if (NUM_LOOP === 1) {
                    console.log(history);
                }
            }
        }
    }
}

const getTotalIncome = () => {
    return (INCOME * PERIOD/30) * NUM_PERIODS;
}

const createSummary = (strLabel, balances) => {
    const assetLength = createAssets().length;
    const summary = {
        label: strLabel,
        balance: balances.reduce((str, bal) => str+'|'+bal),
        totalValue: 0,//時価総額
        lastChartPrices: initArray(assetLength),
        chartPriceLogs: Array(assetLength),
    };
    for (let i=0; i<assetLength; i++) {
        //資産毎の全期間分の日毎の株価のチャートを初期化。
        summary.chartPriceLogs[i] = initArray(PERIOD * NUM_PERIODS);
    }
    return summary;
}

const runMultipulSimulation = (economyChart, balances) => {
    const summary = createSummary(economyChart.K, balances);
    for (let num=0; num<NUM_LOOP; num++) { 
        const assets = createAssets(balances);
        economyChart.V.forEach((keikiHosei) => {
            runShortSimulation(assets, keikiHosei);
        });
        assets.forEach((asset, i) => {
            summary.totalValue += asset.amount * asset.lastChartPrice;
            summary.lastChartPrices[i] += asset.lastChartPrice;
            asset.chartPriceLogs.forEach((price, j) => {
                summary.chartPriceLogs[i][j] += price;
            });
        });
    }
    return summary;
}

const createAssets = (balances=null) => {
    //必ずassets[ICASH]が現金になるようにしてください。
    const assets = [
        createAsset('現金', 0, 0, 0, 1),//削除・順番変更禁止!!
        createAsset('株式', 0, 7, 7, 5),
        createAsset('債券', 0, 2, 0.05, 5),
    ];
    if (Array.isArray(balances)) {
        balances.forEach((bal, i) => {
            assets[i].balance = bal;
        })
    }
    return assets;
}

const printSummary = (summary, numCharts=1) => {
    const div = NUM_LOOP*numCharts;
    const avgTotal = Math.round(summary.totalValue/div);
    const growthRates = summary.lastChartPrices.map((price) => {
        return Math.round(getGrowthRate(price/div, FIRST_CHART_PRICE)) + '%';
    });
    const strGrowthRates = growthRates.reduce((str, price) => str + '|' + price);
    const interest = getGrowthRate(avgTotal, getTotalIncome()) + '%';
    console.log(`${summary.label}\t${summary.balance}\t ${avgTotal}\t${interest}\t ${strGrowthRates}`)
    
    if (summary.label !== '期待値') {
        console.log('相関係数', sampleCorrelation(summary.chartPriceLogs[1], summary.chartPriceLogs[2]));
    }
}

const printTitle = () => {
    console.log('値動き  資産配分 総資産 利回り   騰落率');
}

const initArray = (length, value=0) => {
    const arr = Array(length);
    arr.fill(value);
    return arr;
}

/**
 * ２つの資産の相関係数を調べる。
 * おもにcreateAssetのパラメータ値を決定する為に使用する。
 */
const testCorrelation = () => {
    const numLoop = 1000;
    const x = +0.008;
    const chart = [x,x,x];
    const periodDays = 365;
    let sumCorrel = 0;
    let sumLastPrice1 = 0;
    let sumLastPrice2 = 0;
    for (let iMulti=0; iMulti<numLoop; iMulti++) {
        //label,balance,updown,hoseiMagnification,avgDenominator
        const asset1 = createAsset('株式', 0, 7, 7, 5);
        const asset2 = createAsset('債券', 0, 2, 3, 5);
        const prices1 = initArray(periodDays * chart.length);
        const prices2 = initArray(periodDays * chart.length);
        let day = 0;
        chart.forEach((keikiHosei) => {
            for (let iPeriod=0; iPeriod<periodDays; iPeriod++) {
                const rate1 = getUpdownRate(keikiHosei, asset1.hoseiMagnification, asset1.updown, asset1.avgDenominator) / 100 + 1;
                const rate2 = getUpdownRate(keikiHosei, asset2.hoseiMagnification, asset2.updown, asset2.avgDenominator) / 100 + 1;
                asset1.lastChartPrice = asset1.lastChartPrice * rate1;
                asset2.lastChartPrice = asset2.lastChartPrice * rate2;
                prices1[day] = asset1.lastChartPrice;
                prices2[day] = asset2.lastChartPrice;
                day++;
            }
        });
        sumCorrel += sampleCorrelation(prices1, prices2);
        sumLastPrice1 += asset1.lastChartPrice;
        sumLastPrice2 += asset2.lastChartPrice;
    }
    console.log('相関係数', sumCorrel/numLoop);
    console.log('騰落率1', getGrowthRate(sumLastPrice1/numLoop, 1)+'%');
    console.log('騰落率2', getGrowthRate(sumLastPrice2/numLoop, 1)+'%');
}

const runSimulation = () => {
    //景気チャート
    const economyCharts = createEconomyCharts();

    //資産配分のパターン
    const balancePattern = [
        [0,10,0],
        [0,5,5],
        [0,0,10],
    ];

    const strReb = DO_REBALANCE ? 'リバランス頻度'+REBALANCE_INTERVAL+'日' : 'リバランス無し';
    console.log(`期間${YEARS*3}年：入金額${getTotalIncome()}円(月${INCOME}円)：${strReb}：試行${NUM_LOOP}回`);

    TEST = initArray(balancePattern[0].length);

    //全体の処理を行うループ処理。
    balancePattern.forEach((balances, i) => {
        if (i ===0 || true) {
            printTitle();
        }
        PURCHASE_SUM = createPurchaseSam();
        const allSummary = createSummary("期待値", balances);
        economyCharts.forEach((economyChart) => {
            const subSummary = runMultipulSimulation(economyChart, balances);
            allSummary.totalValue += subSummary.totalValue;
            subSummary.lastChartPrices.forEach((price, i) => {
                allSummary.lastChartPrices[i] += price;
            });
            printSummary(subSummary);
        });
        printSummary(allSummary, economyCharts.length);
        const div = NUM_LOOP*economyCharts.length;
        if (PURCHASE_SUM.sellNums > 0) {
            console.log('売却単価:'+round(PURCHASE_SUM.sellValues/PURCHASE_SUM.sellNums,3)+'円('+round(PURCHASE_SUM.sellNums/div)+')');
        }
        console.log('購入単価:'+round(PURCHASE_SUM.buyValues/PURCHASE_SUM.buyNums,3)+'円('+round(PURCHASE_SUM.buyNums/div,0)+')');
    });   
}

const createEconomyCharts = () => {
    //景気チャート
    const P = +0.008 ;
    const M = -0.008;
    const X = +0.01;
    const economyCharts = [
        {K:"TEST", V:[P,P,P]},
        // {K:"下上上", V:[M,P,P]},
        // {K:"上下上", V:[P,M,P]},
        // {K:"上上下", V:[P,P,M]},
        // {K:"下下上", V:[M,M,P]},
        // {K:"下上下", V:[M,P,M]},
        // {K:"上下下", V:[P,M,M]},
    ];
    return economyCharts;
}

//runSimulation();
testCorrelation();

