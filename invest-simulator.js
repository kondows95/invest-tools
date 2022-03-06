//固定パラメータ
const NUM_LOOP = 1;//シミュレーション施行回数
const INCOME = 20;//入金額
const DAYS_OF_YEAR = 360;
const YEARS = 1/3;
const DAYS_PERIOD = DAYS_OF_YEAR * YEARS;
const NUM_PERIODS = 3;//上下上など3段階で値が大きく動く
const REBALANCE_INTERVAL = DAYS_OF_YEAR*1;//リバランスを実施する間隔(単位は日)
const DO_REBALANCE = false;//リバランスするか？
const ICASH = 0;//assets[0]は必ず現金にする。
const IASSET1 = 1//assets[1]とassets[2]で相関係数を算出する。
const IASSET2 = 2//assets[1]とassets[2]で相関係数を算出する。
const FIRST_CHART_PRICE = 1;//変更不可!


const createPurchaseSam = () => {
    return {
        sellValues: 0,//sellの評価額(単価*口数)
        sellNums: 0,//sellの口数
        buyValues: 0,//buyの評価額(単価*口数)
        buyNums: 0,//buyの口数
    };
}

/**
 * シミュレーション用の株価を取得。
 * 
 * @param  {number} max 騰落率の補正値(年利+8%平均なら8/360)
 * @param  {number} min 補正倍率(-1だと景気と逆相関になる)
 * @param  {number} numTry 平均値を取る際の試行回数(多いほど中央値に近づく)
 * @return {number} maxとminの間の数字
 */
const random = (max, min, numTry) => {
    //numTryが多いと結果が中央値(ゼロ)に近くなる。
    let sum = 0;
    numTry = numTry < 1 ? 1 : numTry;
    for (let i=0; i<numTry; i++) {
        sum += Math.random() * (max - min) + min;
    }
    return sum / numTry;
}

/**
 * 成長率を取得。
 * 
 * @param  {number} current 現在の数値
 * @param  {number} first 最初の数値
 * @return {number} 金利
 */
const getGrowthRate = (current, first) => {
    return ((current - first) / first * 100).toFixed();
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
 * 配列を任意の要素で生成し任意の値で初期化するユーティリティ関数。
 */
 const initArray = (length, value=0) => {
    const arr = Array(length);
    arr.fill(value);
    return arr;
}

/**
 * 資産配分を実行する。
 * 
 * @param  {Array} assets assetオブジェクトの配列
 * @return {Array} 売買履歴の配列。
 */
const rebalance = (assets) => {
    //時価総額ベースで資産配分する。
    const dealAmount = assets.reduce((sum, asset) => {
        return sum + asset.amount;
    });
    const balances =  divideAssets(assets, dealAmount);

    //現金残高がマイナスでない場合は資産配分を実行する。
    const history = [];
    if (balances[ICASH] >= 0) {
        balances.forEach((bal, i) => {
            const diff = bal - assets[i].amount;
            assets[i].amount = bal;
            if (diff > 0) {
                assets[i].buyAmounts += diff;//評価額
                assets[i].buyNums += diff / assets[i].lastChartPrice;//口数
            } else {
                assets[i].sellAmounts -= diff;//評価額
                assets[i].sellNums -= diff / assets[i].lastChartPrice;//口数
            }
            history.push(`${diff>0?'+':''}${diff.toFixed()}|${assets[i].lastChartPrice.toFixed()}|${assets[i].amount.toFixed()}`);
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
 * @param  {Number} interest 補正倍率(景気と逆相関にするならマイナス値を指定)
 * @param  {Boolean} avgDenominator 多いほど値動きがマイルドになる
 * @return {Object} Assetオブジェクト
 */
const createAsset = (label, balance, updown=0, interest=10, avgDenominator=true) => {
    return {
        label: label,
        updown: updown,
        interest: interest,
        avgDenominator: avgDenominator,
        balance: balance,
        amount: 0,//口数(評価額でないことに注意!)
        firstChartPrice: FIRST_CHART_PRICE,
        lastChartPrice: FIRST_CHART_PRICE,
        chartPriceLogs: [],
        buyAmounts: 0,//購入した評価額
        buyNums: 0,//購入した口数(評価額/時価)
        sellAmounts: 0,//売却した評価額
        sellNums: 0,//売却した口数(評価額/時価)
        resetPrice :FIRST_CHART_PRICE,
    };
}

/**
 * summaryオブジェクトを生成
 * 配列のうち最もupdownが低い(ゼロに近い)ものが安全資産扱いとなる
 * 
 * @param  {String} label assetオブジェクトの配列
 * @param  {Array} balances 資産配分比率をセットする配列
 * @return {Object} summaryオブジェクト
 */
 const createSummary = (label, balances) => {
    const assetLength = createAssets().length;
    const summary = {
        label: label,
        balance: balances.reduce((str, bal) => str+'|'+bal),
        totalValue: 0,//時価総額
        lastChartPrices: initArray(assetLength),
        correlations: 0,
        buyAmounts: initArray(assetLength),//購入した評価額(口数*時価)
        buyNums: initArray(assetLength),//購入した口数(評価額/時価)
        sellAmounts: initArray(assetLength),//売却した評価額(口数*時価)
        sellNums: initArray(assetLength),//売却した口数(評価額/時価)
    };
    return summary;
}

/**
 * 全期間の総入金額を取得
 */
 const getTotalIncome = () => {
    return (INCOME * DAYS_PERIOD/30) * NUM_PERIODS;
}

const runShortSimulation = (assets, keikiHosei, secureProfitThreshold) => {
    for (let day=0; day<DAYS_PERIOD; day++) {
        //各々の騰落率に応じて株価と時価総額を毎日増減させる。
        assets.forEach((asset, i) => {
            const rate = (random(asset.updown, -asset.updown, asset.avgDenominator) + keikiHosei * asset.interest) / 100 + 1;
            assets[i].lastChartPrice = assets[i].lastChartPrice * rate;
            assets[i].amount = assets[i].amount * rate;
            assets[i].chartPriceLogs.push(assets[i].lastChartPrice);
        });
        assets[ICASH].lastChartPrice = FIRST_CHART_PRICE;//冗長だが一応

        //利確する。
        if (secureProfitThreshold) {
            assets.forEach((asset, i) => {
                if (asset.lastChartPrice > asset.resetPrice * (1+secureProfitThreshold/100)) {
                    assets[i].sellAmounts += asset.amount
                    assets[i].sellNums += asset.amount / asset.lastChartPrice;
                    assets[ICASH].amount += asset.amount * asset.lastChartPrice;
                    assets[i].amount = 0;
                    assets[i].resetPrice = asset.lastChartPrice;
                    console.log( assets[i].amount)
                    console.log(assets.map((asset) => {
                        return asset.amount;
                    }));
                }
            });
        }

        //毎月の収入で比率に応じて資産を積み立てる。
        if ((1+day) % 30 === 0) {
            //収入を比率で分割。
            const cashs = divideAssets(assets, INCOME);

            //現金なので時価で割って購入量に変換する。
            //10,10 -> 10/1, 10/0.5
            const amounts = cashs.map((cash, i) => cash / assets[i].lastChartPrice);

            //assetsに購入した口数を反映する。
            //また購入した口数と時価を記録する。
            amounts.forEach((amount, i) => {
                assets[i].amount += amount;
                assets[i].buyAmounts += amount;//評価額(口数*時価)
                assets[i].buyÑums += amount / assets[i].lastChartPrice;//購入した口数
            });
            if (NUM_LOOP === 1) {
                console.log(amounts.map((amount, i) => {
                    return amount.toFixed() + '|' + assets[i].lastChartPrice.toFixed(2);
                }));
            }
        }

        //一定期間毎にリバランスを実行。
        if (day !== 0 && (day % REBALANCE_INTERVAL === 0 || day === DAYS_PERIOD-1)) {
            if (DO_REBALANCE) {
                const history = rebalance(assets);
                if (NUM_LOOP === 1) {
                    console.log(history);
                }
            }
        }
    }
}

/**
 * 同じ条件を大量に複数回繰り返して集計する。
 * 
 * @param  {Object} economyChart 値動きの配列とそのlabelのペア
 * @param  {Array} balances 資産配分の配列
 * @return {Object} summaryオブジェクト
 */
const runMultipulSimulation = (economyChart, balances, secureProfitThreshold) => {
    const summary = createSummary(economyChart.K, balances);
    for (let num=0; num<NUM_LOOP; num++) { 
        const assets = createAssets(balances);
        economyChart.V.forEach((keikiHosei) => {
            runShortSimulation(assets, keikiHosei, secureProfitThreshold);
        });
        assets.forEach((asset, i) => {
            summary.totalValue += asset.amount;
            summary.lastChartPrices[i] += asset.lastChartPrice;
            summary.buyAmounts[i] += asset.buyAmounts;
            summary.buyNums[i] += asset.buyNums;
            summary.sellAmounts[i] += asset.sellAmounts;
            summary.sellNums[i] += asset.sellNums;
        });
        //相関係数はsumするとおかしくなるので、
        //個別に係数を算出し、その単純平均をsummaryの相関係数とする。
        summary.correlations += sampleCorrelation(assets[IASSET1].chartPriceLogs, assets[IASSET2].chartPriceLogs);
    }
    return summary;
}


/**
 * 集計結果を表示。
 * 
 * @param  {Object} summary summaryオブジェクトの配列
 * @param  {number} numCharts 下上上などのシナリオの数
 */
const printSummary = (summary, numCharts=1) => {
    const div = NUM_LOOP*numCharts;
    const avgTotal = (summary.totalValue/div).toFixed();
    const growthRates = summary.lastChartPrices.map((price) => {
        return Math.round(getGrowthRate(price/div, FIRST_CHART_PRICE)) + '%';
    });
    const strGrowthRates = growthRates.reduce((str, price) => str + '|' + price);
    const interest = getGrowthRate(avgTotal, getTotalIncome()) + '%';
    const correl = (summary.correlations/div).toFixed(2);
    const buyAmount = (summary.buyAmounts[IASSET1]/div).toFixed();
    const buyNum = (summary.buyNums[IASSET1]/div).toFixed();
    const sellAmount = (summary.sellAmounts[IASSET1]/div).toFixed();
    const sellNum = (summary.sellNums[IASSET1]/div).toFixed();
    console.log(`${summary.label}  ${summary.balance}\t${avgTotal}\t${interest}\t ${strGrowthRates}\t${correl}\t${buyAmount}|${buyNum}\t${sellAmount}|${sellNum}`)
}

/**
 * 集計タイトルを表示。
 */
const printTitle = () => {
    console.log('相場 現|株|債   総資産  利回り   騰落率         相関    株購入|口   株売却|口');
}

/**
 * 大シナリオ毎に集計を実行
 */
const runScenarioSimulation = (chartPattern, balancePattern, secureProfitThreshold) => {
    const strReb = DO_REBALANCE ? 'リバランス頻度'+REBALANCE_INTERVAL+'日' : 'リバランス無し';
    const strProf = secureProfitThreshold ? `開始時価+${secureProfitThreshold}%で利確` : '利確なし';
    console.log(`期間${YEARS*NUM_PERIODS}年：入金額${getTotalIncome()}円(月${INCOME}円)：${strProf}：${strReb}：試行${NUM_LOOP}回`);

    //全体の処理を行うループ処理。
    printTitle();
    balancePattern.forEach((balances, i) => {
        const allSummary = createSummary("AVG", balances);
        chartPattern.forEach((economyChart) => {
            const subSummary = runMultipulSimulation(economyChart, balances, secureProfitThreshold);
            allSummary.totalValue += subSummary.totalValue;
            allSummary.correlations += subSummary.correlations;
            subSummary.lastChartPrices.forEach((price, j) => {
                allSummary.lastChartPrices[j] += price;
                allSummary.buyAmounts[j] += subSummary.buyAmounts[j];
                allSummary.buyNums[j] += subSummary.buyNums[j];
                allSummary.sellAmounts[j] += subSummary.sellAmounts[j];
                allSummary.sellNums[j] += subSummary.sellNums[j];
            });
            printSummary(subSummary);
        });
        printSummary(allSummary, chartPattern.length);
    });   
}

/**
 * 大パラメータを変更して集計を実行(main関数)
 */
const runSimulation = () => {
    //景気チャートのパターン
    const chartPattern = createEconomyCharts();

    //資産配分のパターン
    const balancePattern = [
        [0,10,0],
        // [0,5,5],
        //[5,5,0],
    ];

    //利確のパターン
    const secureProfitPattern = [0,100];
    secureProfitPattern.forEach((threshold) => {
        runScenarioSimulation(chartPattern, balancePattern, threshold);
    }); 
}

/**
 * assetオブジェクトの配列を初期化生成。
 * 
 * @param  {Array} balances 資産配分を表す配列
 * @return {Object} assetオブジェクトの配列
 */
 const createAssets = (balances=null) => {
    const assets = [
        createAsset('現金', 0, 0, 0, 1),//日毎騰落率0%,年利0%
        createAsset('株式', 0, 2, 50, 5),//日毎騰落率2%,正相関で年利8%
        createAsset('債券', 0, 0.5, 2, 5),//日毎騰落率0.5%,正相関で年利2%
    ];
    if (Array.isArray(balances)) {
        balances.forEach((bal, i) => {
            assets[i].balance = bal;
        })
    }
    return assets;
}

const createEconomyCharts = () => {
    //景気チャート
    const KINRI = 1 / DAYS_OF_YEAR;//日利
    const U = +KINRI ;
    const D = -KINRI;
    const chartPattern = [
        //上昇
        {K:"↑↑↑", V:[U,U,U]},
        // {K:"→↑↑", V:[0,U,U]},
        // {K:"↓↑↑", V:[D,U,U]},
        // {K:"↑→↑", V:[U,0,U]},
        // {K:"→→↑", V:[0,0,U]},
        // {K:"↑↑→", V:[U,U,0]},
        // {K:"→↑→", V:[0,U,0]},
        // {K:"↑↓↑", V:[U,D,U]},
        // {K:"→↓↑", V:[0,D,U]},
        // {K:"↑→→", V:[U,0,0]},
        // {K:"↑↑↓", V:[U,U,D]},
        //ニュートラル
        //{K:"↓→↑", V:[D,0,U]},
        // {K:"↓↓↑", V:[D,D,U]},
        // {K:"↓↑→", V:[D,U,0]}, 
        // {K:"→→→", V:[0,0,0]},
        //  //これより下はマイナス
        // {K:"↓→→", V:[D,0,0]},
        // {K:"↑↓→", V:[U,D,0]},
        // {K:"→↑↓", V:[0,U,D]},
        // {K:"→↓→", V:[0,D,0]},
        // {K:"↓↑↓", V:[D,U,D]},
        // {K:"↑→↓", V:[U,0,D]},
        // {K:"→→↓", V:[0,0,D]},
        // {K:"↓→↓", V:[D,0,D]},
        // {K:"↑↓↓", V:[U,D,D]},
        // {K:"↓↓→", V:[D,D,0]},
        // {K:"→↓↓", V:[0,D,D]},
        // {K:"↓↓↓", V:[D,D,D]},
    ];
    return chartPattern;
}
const hukuri = () => {
    const KINRI = 1 + 0.048/DAYS_OF_YEAR;//年利5%の日利
    let amount = 1000;
    let price = 100;
    for (let day=0; day<DAYS_OF_YEAR*15; day++) {
        amount = amount * KINRI;
        price  = price * KINRI;
    }
    console.log(amount + ' ' + price);
}


runSimulation();
//testCorrelation();

