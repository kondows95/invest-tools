//変更不可の定数
const FIRST_CHART_PRICE = 1;//変更不可!
const DAYS_MONTH = 30;//便宜上1ヶ月を30日とする。
const DAYS_YEAR = 360;//便宜上1年を360日とする。
const ICASH = 0;//assets[0]は必ず現金にする。
const IASSET1 = 1//assets[1]とassets[2]で相関係数を算出する。
const IASSET2 = 2//assets[1]とassets[2]で相関係数を算出する。

//適宜手動で変更するパラメータ。
const NUM_LOOP = 300;//シミュレーション施行回数
const INCOME = 15;//入金額
const DAYS_PERIOD = DAYS_YEAR * 7;//各期間の日数
const NUM_PERIODS = 3;//上下上など3段階で値が大きく動く

/**
 * 指定範囲内の乱数を生成
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
        amount: 0,//評価額
        cost: 0,//取得金額
        num: 0,//口数
        lastChartPrice: FIRST_CHART_PRICE,
        chartPriceLogs: [],
        buyAmounts: 0,//購入した評価額
        buyNums: 0,//購入した口数(評価額/時価)
        sellAmounts: 0,//売却した評価額
        sellNums: 0,//売却した口数(評価額/時価)
        firstBuyPrice :FIRST_CHART_PRICE,
        ikkatuBuyPrice: FIRST_CHART_PRICE,
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
        buyAmounts: initArray(assetLength),//購入した評価額(口数*時価)=購入金額
        buyNums: initArray(assetLength),//購入した口数(評価額/時価)
        sellAmounts: initArray(assetLength),//売却した評価額(口数*時価)=購入金額
        sellNums: initArray(assetLength),//売却した口数(評価額/時価)
    };
    return summary;
}

/**
 * 全期間の総入金額を取得
 */
 const getTotalIncome = () => {
    return (INCOME * DAYS_PERIOD/DAYS_MONTH) * NUM_PERIODS;
}

const runShortSimulation = (loop, assets, keikiHosei, param) => {
    for (let d=0; d<DAYS_PERIOD; d++) {
        //親ループを含めた経過日数。
        const day = loop * DAYS_PERIOD + d + 1;

        //各々の騰落率に応じて株価と時価総額を毎日増減させる。
        assets.forEach((asset, i) => {
            const rand = random(asset.updown, -asset.updown, asset.avgDenominator);
            const rate = (rand + keikiHosei * asset.interest) / 100 + 1;
            assets[i].lastChartPrice = assets[i].lastChartPrice * rate;
            assets[i].amount = assets[i].amount * rate;
            assets[i].chartPriceLogs.push(assets[i].lastChartPrice);
        });
        assets[ICASH].lastChartPrice = FIRST_CHART_PRICE;//冗長だが一応

        //利確or一括投資を実施。
        if (param.rikakuThreshold || param.ikkatuThreshold) {
            assets.forEach((asset, i) => {
                //利確。買い始めより株価がn%上昇したら売る。
                if (param.rikakuThreshold 
                    && asset.lastChartPrice > asset.firstBuyPrice * (1 + (param.rikakuThreshold/100)) 
                    && asset.amount
                ) {
                    //売却益にかかる税金の計算。
                    const tempAmount = asset.amount;
                    const profit = tempAmount - asset.cost;
                    const tax = profit * 0.2;
                    //assetに増減を反映。
                    const tempNum = tempAmount / asset.lastChartPrice;//口数
                    const withoutTax = tempAmount - tax;
                    assets[i].sellAmounts += tempAmount;
                    assets[i].sellNums += tempNum;
                    assets[ICASH].amount += withoutTax;
                    assets[ICASH].cost += withoutTax;
                    assets[ICASH].num += withoutTax;
                    assets[i].amount = 0;
                    assets[i].cost = 0;
                    assets[i].num = 0;
                    assets[i].firstBuyPrice = asset.lastChartPrice;
                    //debug表示。
                    if (NUM_LOOP === 1) {
                        console.log('利確', assets.map((asset, j) => {
                            let n = 0;
                            if (j===i) { n =tempAmount; }
                            if (j===ICASH) { n =withoutTax; }
                            const sa = j===i ? '-' : '+';
                            return '@' + asset.lastChartPrice.toFixed(1) 
                                + '|' + asset.amount.toFixed(1) 
                                + '(' + sa + n.toFixed(1) + ')';
                        }).join(" "));
                    }
                }

                //一括投資。最後に買った時より株価がn%下落したら一括投資。
                if (param.ikkatuThreshold 
                    && asset.lastChartPrice < asset.ikkatuBuyPrice * (1 + (param.ikkatuThreshold/100)) 
                    && assets[ICASH].amount > 0
                ) {
                    const tempAmount = assets[ICASH].amount;
                    const tempNum = tempAmount / asset.lastChartPrice;//口数
                    assets[i].buyAmounts += tempAmount;
                    assets[i].buyNums += tempNum;
                    assets[ICASH].amount = 0;
                    assets[ICASH].cost = 0;
                    assets[ICASH].num = 0;
                    assets[i].amount += tempAmount;
                    assets[i].cost += tempAmount;
                    assets[i].num += tempNum;
                    assets[i].ikkatuBuyPrice = asset.lastChartPrice;
                    //debug表示。
                    if (NUM_LOOP === 1) {
                        console.log('一括投資', assets.map((asset, j) => {
                            const n = (j===i || j===ICASH) ? tempAmount : 0;
                            const sa = j===ICASH ? '-' : '+';
                            return '@' + asset.lastChartPrice.toFixed(1) 
                                + '|' + asset.amount.toFixed(1) 
                                + '(' + sa + n.toFixed(1) + ')';
                        }).join(" "));
                    }
                }
            });
        }

        //毎月の収入で比率に応じて資産を積み立てる。
        let incomes;
        if (day % DAYS_MONTH === 0) {
            if (!param.rebalance) {
                //リバランスしないので単純に収入を比率で分割。
                incomes = divideAssets(assets, INCOME);
            } else {
                //リバランスの為にまず全資産の比率を求める。
                let totalAmount = INCOME;
                assets.forEach((asset) => {
                    totalAmount += asset.amount;
                });
                const totalBalances =  divideAssets(assets, totalAmount);

                //非売却方式のりバランスなので給料で足りない資産を買う。
                //例えば現金50%株50%で株が暴騰した場合、比率が戻るまでは株を買わず現金を買う(=貯金)。
                incomes = initArray(assets.length);
                let tempIncome = INCOME;
                totalBalances.forEach((bal, i) => {
                    const diff = bal - assets[i].amount;
                    if (diff > 0) {
                        //足りないので買う。
                        const buy = diff > tempIncome ? tempIncome : diff;
                        tempIncome -= buy;
                        incomes[i] = buy;
                    }
                });
                //残りがあれば比率に応じて配分してincomesに加える。
                if (tempIncome > 0) {
                    const remine = divideAssets(assets, tempIncome);
                    remine.forEach((rem, i) => {
                        incomes[i] += rem;
                    });
                }
            }

            //debug表示。複利の増えを確認する為に反映前に表示。
            if (NUM_LOOP === 1) {
                console.log('buy', assets.map((asset, i) => {
                    return '@' + asset.lastChartPrice.toFixed(1) 
                        + '|' + asset.amount.toFixed(1) 
                        + '+(' + incomes[i].toFixed(1) + ')'
                        + '=' + (asset.amount + incomes[i]).toFixed(1);
                }).join("  "));
            }

            //assetsに購入量と口数を反映する。
            incomes.forEach((amount, i) => {
                const tempNum = amount / assets[i].lastChartPrice;//購入した口数
                assets[i].amount += amount;
                assets[i].cost += amount;
                assets[i].num += tempNum;
                assets[i].buyAmounts += amount;//評価額(口数*時価)=金額
                assets[i].buyNums += tempNum;//購入した口数
            });
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
const runMultipulSimulation = (economyChart, balances, param) => {
    const summary = createSummary(economyChart.K, balances);
    for (let num=0; num<NUM_LOOP; num++) { 
        const assets = createAssets(balances);
        economyChart.V.forEach((keikiHosei, loop) => {
            runShortSimulation(loop, assets, keikiHosei, param);
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


    const buyAmounts = initArray(summary.buyAmounts.length);
    const buyPrices = initArray(summary.buyAmounts.length);
    const sellAmounts = initArray(summary.buyAmounts.length);
    const sellPrices = initArray(summary.buyAmounts.length);
    for (let i=0; i<summary.buyAmounts.length; i++) {
        if (summary.buyAmounts[i] > 0) {
            buyAmounts[i] = (summary.buyAmounts[i]/div).toFixed();
            buyPrices[i] = (summary.buyAmounts[i]/summary.buyNums[i]).toFixed(2)
        }
        if (summary.sellAmounts[i] > 0) {
            sellAmounts[i] = (summary.sellAmounts[i]/div).toFixed();
            sellPrices[i] = (summary.sellAmounts[i]/summary.sellNums[i]).toFixed(2);
        }
    } 
    console.log(`${summary.label}  ${summary.balance}\t${avgTotal}\t${interest}\t ${strGrowthRates}\t${correl}\t${buyAmounts[IASSET1]}@${buyPrices[IASSET1]}|${buyAmounts[IASSET2]}@${buyPrices[IASSET2]}\t${sellAmounts[IASSET1]}@${sellPrices[IASSET1]}|${sellAmounts[IASSET2]}@${sellPrices[IASSET2]}`)
}

/**
 * 集計タイトルを表示。
 */
const printTitle = () => {
    console.log('相場 現|株|債   総資産  利回り   騰落率         相関    買株@単価|買債@単価     売株@単価|売債@単価');
}

/**
 * 大シナリオ毎に集計を実行
 */
const runScenarioSimulation = (chartPattern, balancePattern, param) => {
    const reb = param.rebalance ? '非売却リバランス' : 'リバランス無し';
    const rikaku = param.rikakuThreshold ? `開始時価+${param.rikakuThreshold}%で利確` : '利確なし';
    const ikkatu = param.ikkatuThreshold ? `開始時価${param.ikkatuThreshold}%で一括投資` : '一括投資なし';
    console.log(`期間${DAYS_PERIOD*NUM_PERIODS/DAYS_YEAR}年：入金額${getTotalIncome()}円(月${INCOME}円)：${rikaku}：${ikkatu}：${reb}：試行${NUM_LOOP}回`);

    //全体の処理を行うループ処理。
    printTitle();
    balancePattern.forEach((balances, i) => {
        const allSummary = createSummary("AVG", balances);
        chartPattern.forEach((economyChart) => {
            const subSummary = runMultipulSimulation(economyChart, balances, param);
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
 * assetオブジェクトの配列を初期化生成。
 * 
 * @param  {Array} balances 資産配分を表す配列
 * @return {Object} assetオブジェクトの配列
 */
 const createAssets = (balances=null) => {
    const assets = [
        createAsset('現金', 0, 0, 0, 1),//日毎騰落率0%,年利0%
        createAsset('株式', 0, 2, 8, 10),//日毎騰落率2%,正相関で年利8%
        createAsset('債券', 0, 0.5, 2, 5),//日毎騰落率0.5%,正相関で年利2%
    ];
    if (Array.isArray(balances)) {
        balances.forEach((bal, i) => {
            assets[i].balance = bal;
        })
    }
    return assets;
}

/**
 * 大パラメータを変更して集計を実行(main関数)
 */
const runSimulation = () => {
    //景気チャートのパターン
    const KINRI = 1 / DAYS_YEAR;//日利
    const U = +KINRI ;
    const D = -KINRI;
    const chartPattern = [
        // //上昇
        // {K:"↑↑↑", V:[U,U,U]},
        // {K:"→↑↑", V:[0,U,U]},
        // {K:"↓↑↑", V:[D,U,U]},
        // {K:"↑→↑", V:[U,0,U]},
        // {K:"→→↑", V:[0,0,U]},
        // {K:"↑↑→", V:[U,U,0]},
        // {K:"→↑→", V:[0,U,0]},
        // {K:"↑↓↑", V:[U,D,U]},
        // {K:"→↓↑", V:[0,D,U]},
        // {K:"↑→→", V:[U,0,0]},
        // {K:"↓→↑", V:[D,0,U]},
        // {K:"↓↑→", V:[D,U,0]}, 
        // {K:"↓↓↑", V:[D,D,U]},
        // //下落
        // {K:"→→→", V:[0,0,0]},
        // {K:"↑↑↓", V:[U,U,D]},             
        // {K:"↓→→", V:[D,0,0]},
        // {K:"↑↓→", V:[U,D,0]},
        // {K:"→↑↓", V:[0,U,D]},
        // {K:"↓↑↓", V:[D,U,D]},
        // {K:"→↓→", V:[0,D,0]},
        {K:"↓↓→", V:[D,D,0]},
        {K:"↑→↓", V:[U,0,D]},
        {K:"→→↓", V:[0,0,D]},
        {K:"↓→↓", V:[D,0,D]},
        {K:"↑↓↓", V:[U,D,D]},
        {K:"→↓↓", V:[0,D,D]},
        // {K:"↓↓↓", V:[D,D,D]},
    ];

    //資産配分のパターン
    const balancePattern = [
        // [0,10,0],
        // [0,5,5],
        // [5,5,0],
        [2,5,3]
    ];

    //利確と一括投資のパターン(利確基準値,一括投資基準値,リバランス)
    const paramPatterns = [
        {rikakuThreshold: 0, ikkatuThreshold: 0, rebalance: false},
    ];
    paramPatterns.forEach((param) => {
        runScenarioSimulation(chartPattern, balancePattern, param);
    });     
}


runSimulation();
