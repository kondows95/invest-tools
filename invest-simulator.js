//固定パラメータ
const NUM_LOOP = 1;//シミュレーション施行回数
const YEARS = 1/3;
const INCOME = 30;//入金額
const PERIOD = 360 * YEARS;
const NUM_PERIODS = 3;//上下上など3段階で値が大きく動く
const REBALANCE_INTERVAL = 30;//リバランスを実施する間隔(単位は日)
const DO_REBALANCE = true;//リバランスはやらない方が良い
const ICASH = 0;//assets[0]は必ず現金にする。
const FIRST_CHART_PRICE = 1;//変更不可!

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
 * 時価総額と比率に応じて資産を分割する。
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
            const diff = Math.round(bal - assets[i].amount);
            assets[i].amount = bal;
            //デバッグ用
            const value = Math.round(assets[i].lastChartPrice *　assets[i].amount);
            const lastChartPrice = Math.round(assets[i].lastChartPrice);
            const amount = Math.round(assets[i].amount);
            history.push(`${diff>0?'+':''}${diff}|${lastChartPrice}*${amount}=${value}`);
        });
    }
    else {
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
    };
}

const runShortSimulation = (days, assets, interval, keikiHosei) => {
    for (let day=0; day<days; day++) {
        //各々の騰落率に応じて株価を増減させる。
        assets.forEach((asset, i) => {
            const rate = getUpdownRate(keikiHosei, asset.updown, asset.volatility, asset.positive) / 100 + 1;
            assets[i].lastChartPrice = assets[i].lastChartPrice * rate;
        });
        assets[ICASH].lastChartPrice = FIRST_CHART_PRICE;//冗長だが一応

        //毎月の収入で比率に応じて資産を積み立てる。
        if (day % 30 === 0) {
            //収入を比率で分割。
            const divs = divideAssets(assets, INCOME);

            //時価総額に応じた口数に変更する。
            const nums = divs.map((div, i) => div / assets[i].lastChartPrice);

            //assetsに購入した口数を反映する。
            nums.forEach((num, i) => {
                assets[i].amount += num
            });
            if (NUM_LOOP === 1) {
                console.log(nums)
                //console.log(nums.map((num, i) => num));
            }
        }

        //一定期間毎にリバランスを実行。
        if (day !== 0 && (day % interval === 0 || day === days-1)) {
            if (DO_REBALANCE) {
                const history = rebalance(assets);
                if (NUM_LOOP === 1) {
                    console.log(history);
                }
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
    //必ずassets[ICASH]が現金になるようにしてください。
    const assets = [
        createAsset('現金', 0, 0, 1, false),//変更禁止(ICASH)
        createAsset('株式', 0, 10, 100, true),
        //createAsset('逆相関株式', 0, 7, 10, false),
        createAsset('債権', 0, 10, 100, true),
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
    const DEBUGHOSEI = 0.01
    //景気チャート
    const P = +0.008 ;
    const M = -0.008;
    const X = -0.01;
    const economyCharts = [
        {K:"TEST", V:[X,X,X]},
        // {K:"下上上", V:[M,P,P]},
        // {K:"上下上", V:[P,M,P]},
        // {K:"上上下", V:[P,P,M]},
        // {K:"下下上", V:[M,M,P]},
        // {K:"下上下", V:[M,P,M]},
        // {K:"上下下", V:[P,M,M]},
    ];

    //資産配分のパターン
    const balancePattern = [
        [0,5,5],
    ];

    console.log(`期間${YEARS*3}年：入金額${getTotalIncome()}円(月${INCOME}円)：リバランス頻度${REBALANCE_INTERVAL}日：試行${NUM_LOOP}回：`)

    //全体の処理を行うループ処理。
    balancePattern.forEach((balances, i) => {
        if (i ===0 || true) {
            printTitle();
        }
        const allSummary = createSummary("期待値", balances);
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

