//固定パラメータ
const NUM_LOOP = 10000;//シミュレーション施行回数
const YEARS = 5;
const INCOME = 25;//入金額
const FIRST_CHART_PRICE = 100;//騰落率計算用なので何でも良い
const PERIOD = 360 * YEARS;
const NUM_PERIODS = 3;//上下上など3段階で値が大きく動く
const REBALANCE_INTERVAL = 30*12;//リバランスを実施する間隔(単位は日)
const INVEST_LIMIT = REBALANCE_INTERVAL//リバランスで安全資産が減る額の上限

/**
 * シミュレーション用の株価を取得。
 * 
 * @param  {number} keikiHosei 騰落率の補正値(例不景気なら-0.1)
 * @param  {number} upRate 騰落率の最大値(例:5%なら5)
 * @param  {number} numTry 平均値を取る際の試行回数(少ないほど乱高下)
 * @param  {Boolean} positive 景気補正に相関するか(逆相関ならfalse)
 * @return {number} 騰落率(例:-4%なら-4)
 */
const getUpdownRate = (keikiHosei, updown=5, numTry=10, positive=true) => {
    //updownが多いほうが景気の影響を受けやすく、ボラティリティが高くなるようにする。
    //positiveがfalseの場合は補正値の符号を反転させて景気と逆相関にする。
    let hosei = keikiHosei * updown;
    if (!positive) {
        hosei = -hosei;
    }
    const max = updown + hosei;
    const min = -updown + hosei;  
    
    //複数回試行して平均を取ることで値動きをマイルドにする。
    numTry = Math.max(1, numTry);
    let sum = 0;
    for (let i=0; i<numTry; i++) {
        sum += Math.random() * (max - min) + min;
    }
    return (sum / numTry);
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
 * 比率に応じて資産を分割する。
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
 * 資産配分を実行する。
 * 
 * @param  {Array} assets assetオブジェクトの配列
 * @return {Array} 売買履歴の配列。
 */
const rebalance = (assets) => {
    //今月の投資資金(全資産合計)
    let dealAmount = 0;
    assets.forEach((asset, i) => {
        dealAmount += asset.amount;
    });

    //まず最初にリバランス。
    let balances = divideAssets(assets, dealAmount);

    //資産を売買する(amountが負の場合は売り)
    const history = [];
    assets.forEach((asset, i) => {
        let diff = balances[i] - asset.amount;
        assets[i].amount = balances[i];
        history.push(`${Math.round(assets[i].lastChartPrice)}/${Math.round(diff)}/${Math.round(assets[i].amount)}`)
    });

    return history;
}

/**
 * Assetオブジェクトの定義
 * 配列のうち最もupdownが低い(ゼロに近い)ものが安全資産扱いとなる
 * 
 * @param  {String} label assetオブジェクトの配列
 * @param  {Number} balance 資産配分の比率(9割なら9)
 * @param  {Number} updown その資産の日毎の騰落率の最大値(-5%なら-5)
 * @param  {Number} volatility 逆ボラティリティ(低いほど乱高下)
 * @param  {Boolean} positive 値動きに相関するか(逆相関ならfalse)
 * @return {Object} Assetオブジェクト
 */
const createAsset = (label, balance, updown=0, volatility=10, positive=true) => {
    return {
        label: label,
        updown: updown,
        volatility: volatility,
        positive: positive,
        balance: balance,
        amount: 0,
        firstChartPrice: FIRST_CHART_PRICE,
        lastChartPrice: FIRST_CHART_PRICE,
        investHistory: [],
        chartPriceHistory: [],
    };
}

const runShortSimulation = (days, assets, interval, keikiHosei) => {
    for (let day=0; day<days; day++) {
        //各々の騰落率に応じて資産を増減させる。
        assets.forEach((asset, i) => {
            let rate = getUpdownRate(keikiHosei, asset.updown, asset.volatility, asset.positive) / 100 + 1;
            assets[i].amount = assets[i].amount * rate;
            assets[i].lastChartPrice = assets[i].lastChartPrice * rate;
        });

        //毎月の収入で比率に応じて資産を積み立てる。
        if (day % 30 === 0) {
            const balances = divideAssets(assets, INCOME);
            assets.forEach((asset, i) => {
                assets[i].amount += balances[i];
            });
            if (NUM_LOOP === 1) {
                const arr = [];
                assets.forEach((asset, i) => {
                    arr.push(`#${Math.round(assets[i].lastChartPrice)}/${Math.round(balances[i])}/${Math.round(assets[i].amount)}`)
                });
                console.log(arr);
            }
        }

        //一定期間毎にリバランスを実行。
        if (day !== 0 && (day % interval === 0 || day === days-1)) {
            const history = rebalance(assets);
            if (NUM_LOOP === 1) {
                console.log(day);
                console.log(history);
            }
        }
    }
}

const getBalanceLabel = (balances) => {
    return balances.reduce((str, bal) => str + ":" + bal);
}

const getTotalIncome = () => {
    return (INCOME * PERIOD/30) * NUM_PERIODS;
}

const createSummary = (strLabel, strBalance) => {
    const summary = {
        label: strLabel,
        balance: strBalance,
        total: 0,
        lastChartPrices: Array(createAssets().length),
    };
    summary.lastChartPrices.fill(0);
    return summary;
}

const runMultipulSimulation = (economyChart, balances) => {
    const summary = createSummary(economyChart.K, balances);
    for (let num=0; num<NUM_LOOP; num++) { 
        const assets = createAssets(balances);
        economyChart.V.forEach((keikiHosei) => {
            runShortSimulation(PERIOD, assets, REBALANCE_INTERVAL, keikiHosei);
        });
        assets.forEach((asset, i) => {
            summary.total += asset.amount;
            summary.lastChartPrices[i] += asset.lastChartPrice;
        });
    }
    return summary;
}

const createAssets = (balances=null) => {
    const assets = [
        createAsset('株式1', 0, 6, 10, true),
        createAsset('逆相関2', 0, 6, 10, false),
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
    const avgTotal = Math.round(summary.total/div);
    const growthRates = summary.lastChartPrices.map((price) => {
        return Math.round(getGrowthRate(price/div, FIRST_CHART_PRICE)) + '%';
    });
    const strGrowthRates = growthRates.reduce((str, price) => str + '/' + price);
    const interest = getGrowthRate(avgTotal, getTotalIncome()) + '%';
    console.log(`${summary.label}\t${summary.balance}\t ${avgTotal}\t${interest}\t ${strGrowthRates}`)
}

const printTitle = () => {
    console.log('値動き  資産配分 総資産 利回り   騰落率');
}

const runSimulation = () => {
    //景気チャート
    const P = +0.0024;
    const M = -0.0024;
    const economyCharts = [

        {K:"上上上", V:[P,P,P]},
        {K:"下上上", V:[M,P,P]},
        {K:"上下上", V:[P,M,P]},
        {K:"上上下", V:[P,P,M]},
        {K:"下下上", V:[M,M,P]},
        {K:"下上下", V:[M,P,M]},
        {K:"上下下", V:[P,M,M]},
        {K:"下下下", V:[M,M,M]},
    ];

    //資産配分のパターン
    const balancePattern = [
        [10,0],
        [5,5],
        [0,10],
    ];

    console.log(`毎月${INCOME}円入金：期間${YEARS*3}年：毎年リバランス：試行${NUM_LOOP}回`)

    //全体の処理を行うループ処理。
    balancePattern.forEach((balances, i) => {
        if (i ===0 || true) {
            printTitle();
        }
        const allSummary = createSummary("全平均", balances);
        economyCharts.forEach((economyChart) => {
            const subSummary = runMultipulSimulation(economyChart, balances);
            allSummary.total += subSummary.total;
            subSummary.lastChartPrices.forEach((price, i) => {
                allSummary.lastChartPrices[i] += price;
            });
            printSummary(subSummary);
        });
        printSummary(allSummary, economyCharts.length);
    });
}
runSimulation();

